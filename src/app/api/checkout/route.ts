import { createHash } from 'node:crypto'
import { Types, type ClientSession } from 'mongoose'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError, requirePermission, readBody, safeApi } from '@/lib/api-security'
import { BusinessSettings } from '@/models/BusinessSettings'
import { defaultBusinessSettings } from '@/lib/business-settings'
import { textileProduction } from '@/models/TextileProduction'

// CUSTOMER subledger: an invoice debits receivables; payment credits receivables.
// Operational cash/bank register != balanced general ledger, tax, revenue or COGS.
const reference = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/)
const amount = z.number().int().min(0).max(1_000_000_000)
const partyId = z.string().regex(/^[a-fA-F0-9]{24}$/)
const dateOnly = z.iso.date()
const method = z.enum(['cash', 'bank'])
const saleLine = z.strictObject({ thaanId: reference, suits: z.number().int().min(1).max(1000) })
const sale = z.strictObject({
  kind: z.literal('sale'), reference, date: dateOnly,
  partyId: partyId.optional(), customerName: z.string().trim().min(1).max(100).optional(),
  // Legacy full-thaan requests remain valid for idempotent replays. New checkout uses lines.
  thaanIds: z.array(reference).min(1).max(40).optional(),
  lines: z.array(saleLine).min(1).max(40).optional(),
  total: amount.positive(), paid: amount, method: method.optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.lines) === Boolean(value.thaanIds)) ctx.addIssue({ code: 'custom', message: 'Provide either suit quantities or legacy thaan IDs' })
  if (value.paid > value.total) ctx.addIssue({ code: 'custom', message: 'Payment exceeds invoice amount' })
  if (value.paid && !value.method) ctx.addIssue({ code: 'custom', message: 'Payment method required' })
  if (!value.partyId && value.paid !== value.total) ctx.addIssue({ code: 'custom', message: 'Walk-in sales must be fully paid' })
})
const payment = z.strictObject({
  kind: z.literal('payment'), reference, date: dateOnly,
  partyId, amount: amount.positive(), method,
})
const requestSchema = z.union([sale, payment])

type Item = { id: string; grade: string; suits: number; totalUm: number; fullThaan?: boolean; lotId?: string; orderId?: string; batchId?: string }
type SaleRecord = {
  _id: string; kind: 'sale' | 'payment'; reference: string;
  partyId?: string; partyName: string; walkIn: boolean;
  date: string; total: number; paid: number; method?: 'cash' | 'bank';
  thaanIds: string[]; items: Item[]; actor: string; postedAt: Date; fingerprint: string;
}
type Receipt = {
  _id: string; sourceId: string; reference: string; date: string;
  amount: number; method: 'cash' | 'bank'; partyName: string;
  walkIn: boolean; kind: 'sale' | 'payment'; actor: string; postedAt: Date;
}
const activeCustomer = {
  type: { $in: ['party', 'customer'] },
  archivedAt: null,
  'meta.partyKind': { $nin: ['supplier', 'processor'] },
}

type Party = { _id: Types.ObjectId; name: string; type: string; archivedAt?: Date | null;
  openingBalance?: number; openingIsDebit?: boolean; checkoutVersion?: number }
class BusinessError extends Error { constructor(readonly status: number, message: string) { super(message) } }

async function currentDue(connSession: ClientSession | undefined, accountId: Types.ObjectId, opening: number) {
  const conn = (await dbConnect()).connection
  const result = await conn.collection('transactions').aggregate<{ delta: number }>([
    { $match: { account: accountId } },
    { $group: { _id: null, delta: { $sum: { $subtract: [{ $ifNull: ['$debit', 0] }, { $ifNull: ['$credit', 0] }] } } } },
  ], { session: connSession }).toArray()
  return Math.round((opening + (result[0]?.delta ?? 0)) * 100) / 100
}

export const GET = safeApi(async function GET(req: Request) {
  const denied = await requirePermission('read')
  if (denied) return denied
  const url = new URL(req.url)
  const conn = (await dbConnect()).connection
  const revision = await BusinessSettings.findOne().sort({ _id: -1 }).lean()
  const settings = revision?.settings ?? defaultBusinessSettings
  const timeZone = settings.localization.timeZone
  const businessDay = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const day = url.searchParams.get('date') ?? businessDay
  if (!dateOnly.safeParse(day).success) return apiError(400, 'Invalid report date')
  const wanted = url.searchParams.get('partyId')
  if (wanted && !partyId.safeParse(wanted).success) return apiError(400, 'Invalid customer')

  const { thaans } = textileProduction(conn)
  const accounts = conn.collection<Party>('accounts')
  const records = conn.collection<SaleRecord>('checkout_documents')
  const cashbook = conn.collection<Receipt>('checkout_receipts')
  const parties = await accounts.find(activeCustomer, {projection: {name:1}}).sort({name:1}).limit(300).toArray()
  const available = await thaans.find({ saleId: { $exists: false } }).sort({ postedAt: -1 }).limit(500).toArray()
  const recent = await records.find({}, { projection: { fingerprint: 0 } }).sort({ postedAt: -1 }).limit(60).toArray()
  // Full daily document register for small-shop use. Reject silent truncation in the UI.
  const dailyCount = await records.countDocuments({ date: day })
  const dailyDocuments = await records.find({ date: day }, { projection: { fingerprint: 0 } })
    .sort({ postedAt: 1, _id: 1 }).limit(2000).toArray()
  const receipts = await cashbook.find({ date: day }).sort({ postedAt: 1 }).limit(2000).toArray()
  const totals = await records.aggregate<{
    saleTotal: number; sales: number; walkInSales: number; paidAtSale: number; paymentsAgainstDue: number;
    newUdhar: number; cashReceived: number; bankReceived: number;
  }>([
    { $match: {date:day} },
    { $group: { _id: null,
      saleTotal: { $sum: { $cond: [{ $eq: ['$kind','sale'] }, '$total', 0] } },
      sales: { $sum: { $cond: [{ $eq: ['$kind','sale'] }, 1, 0] } },
      walkInSales: { $sum: { $cond: [{ $and:[{ $eq: ['$kind','sale'] }, '$walkIn'] }, 1, 0] } },
      paidAtSale: { $sum: { $cond: [{ $eq: ['$kind','sale'] }, '$paid', 0] } },
      paymentsAgainstDue: { $sum: { $cond: [{ $eq: ['$kind','payment'] }, '$paid', 0] } },
      newUdhar: { $sum: { $cond: [{ $eq: ['$kind','sale'] }, { $subtract: ['$total','$paid'] }, 0] } },
      cashReceived: { $sum: { $cond: [{ $eq: ['$method','cash'] }, '$paid', 0] } },
      bankReceived: { $sum: { $cond: [{ $eq: ['$method','bank'] }, '$paid', 0] } },
    } },
  ]).toArray()
  let due: number | null = null
  if (wanted) {
    const party = await accounts.findOne({_id:new Types.ObjectId(wanted), ...activeCustomer})
    if (party) {
      const opening = Number(party.openingBalance ?? 0) * (party.openingIsDebit === false ? -1 : 1)
      due = await currentDue(undefined, party._id, opening)
    }
  }
  const [volume] = await records.aggregate([
    { $match: { date: day, kind: 'sale' } },
    { $unwind: '$items' },
    { $group: {
      _id: null,
      suitsSold: { $sum: '$items.suits' },
      soldUm: { $sum: { $toDecimal: '$items.totalUm' } },
      fullThaans: { $sum: { $cond: [{ $eq: ['$items.fullThaan', true] }, 1, 0] } },
    } },
    { $project: { _id: 0, suitsSold: 1, soldUm: { $toString: '$soldUm' }, fullThaans: 1 } },
  ]).toArray()
  const customerHistory = wanted ? await records.find({ partyId: wanted.toLowerCase() }, { projection: { fingerprint: 0 } })
    .sort({ postedAt: -1, _id: -1 }).limit(100).toArray() : []
  return Response.json({
    businessName: settings.profile.name, businessDay, volume: volume ?? { suitsSold: 0, soldUm: '0', fullThaans: 0 },
    customerHistory,
    parties:parties.map(p => ({id:String(p._id),name:p.name})),
    thaans:available.map(t => {
      const remaining = Math.max(0, t.suits - (t.soldSuits ?? 0))
      return {id:t._id,suits:remaining,totalUm:remaining * (t.totalUm / t.suits),grade:t.contents.map(i=>i.grade).join('/')}
    }).filter(t => t.suits > 0),
    recent, due, day, dailyCount, dailyDocuments, receipts,
    totals:totals[0] ?? {saleTotal:0,sales:0,walkInSales:0,paidAtSale:0,paymentsAgainstDue:0,newUdhar:0,cashReceived:0,bankReceived:0},
  }, { headers: { 'Cache-Control':'no-store' } })
})

export const POST = safeApi(async function POST(req: Request) {
  const denied = await requirePermission('inventoryPost', req)
  if (denied) return denied
  const actor = await getSession()
  if (!actor || actor.role === 'accountant') return apiError(403, 'Forbidden')
  const doc = await readBody(req, requestSchema)
  if (!doc) return apiError(400, 'Invalid document')
  if (doc.kind === 'sale') {
    const ids = doc.lines?.map(line => line.thaanId) ?? doc.thaanIds ?? []
    if (new Set(ids).size !== ids.length) return apiError(400, 'Duplicate thaan')
  }
  const conn = (await dbConnect()).connection
  const fixtureEnabled = process.env.OARLINKS_POS_FIXTURE === '1' &&
    /^oarlinks_(?:checkout|suit|phase0|pos)_[a-z0-9_]+$/.test(conn.name) &&
    process.env.MONGODB_URI === 'mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true'
  if (!fixtureEnabled) {
    return apiError(409, 'POS posting is unavailable. Have an administrator approve and integrate the general-ledger account mappings before accepting payments.')
  }
  const records = conn.collection<SaleRecord>('checkout_documents')
  const accounts = conn.collection<Party>('accounts')
  const receipts = conn.collection<Receipt>('checkout_receipts')
  const transactions = conn.collection('transactions')
  const { thaans } = textileProduction(conn)
  const id = doc.kind + ':' + doc.reference
  const fingerprint = createHash('sha256').update(JSON.stringify(doc)).digest('hex')

  try {
    const replayed = await conn.transaction(async session => {
      const old = await records.findOne({ _id:id }, {session})
      if (old) {
        if (old.fingerprint !== fingerprint) throw new BusinessError(409, 'Reference already used with different data')
        return true
      }
      let customer: Types.ObjectId | undefined
      let customerName = doc.kind === 'sale' ? (doc.customerName || 'Walk-in Customer') : ''
      let previousDue = 0
      if (doc.partyId) {
        customer = new Types.ObjectId(doc.partyId)
        // Serialize postings for the same registered customer, including repayments.
        const party = await accounts.findOneAndUpdate({ _id:customer, ...activeCustomer },
          { $inc:{checkoutVersion:1} }, {session, returnDocument:'after'})
        if (!party) throw new BusinessError(400, 'Active customer not found')
        customerName = party.name
        const opening = Number(party.openingBalance ?? 0) * (party.openingIsDebit === false ? -1 : 1)
        previousDue = await currentDue(session, customer, opening)
      }
      const postedAt = new Date()
      const entryDate = new Date(doc.date+'T12:00:00.000Z')
      const entries: Record<string, unknown>[] = []
      const items: Item[] = []
      let total = 0, paid = 0
      let paymentMethod: 'cash' | 'bank' | undefined
      if (doc.kind === 'sale') {
        total = doc.total
        paid = doc.paid
        paymentMethod = doc.method
        if (!customer && paid !== total) throw new BusinessError(400, 'Walk-in sales require full payment')
        const purchaseLines = doc.lines ?? (doc.thaanIds ?? []).map(thaanId => ({thaanId,suits:0}))
        for (const line of purchaseLines) {
          // Legacy thaanIds means 'sell every remaining suit' (original full-thaan behavior).
          const current = await thaans.findOne({_id:line.thaanId,saleId:{$exists:false}}, {session})
          if (!current) throw new BusinessError(409, 'Thaan unavailable or already sold: '+line.thaanId)
          const existingSold = current.soldSuits ?? 0
          const available = current.suits - existingSold
          const count = line.suits || available
          if (!Number.isSafeInteger(count) || count < 1 || count > available) throw new BusinessError(409,'Not enough suits remaining in thaan '+line.thaanId)
          // Historical mixed-grade thaans can only be sold in full; partial sale would lose grade attribution.
          if (current.contents.length !== 1 && count < available) throw new BusinessError(409, 'Mixed-grade historical thaan must be sold as a whole')
          // Conditional atomic deduction prevents overselling even with simultaneous counter operators.
          const updated = await thaans.findOneAndUpdate({
            _id:line.thaanId, saleId:{$exists:false},
            $expr:{$lte:[{$add:[{$ifNull:['$soldSuits',0]},count]},'$suits']},
          },{$inc:{soldSuits:count}},{session, returnDocument:'after'})
          if (!updated) throw new BusinessError(409,'Thaan stock changed. Refresh and retry with a new document number only if nothing posted.')
          if (updated.soldSuits === updated.suits) {
            await thaans.updateOne({_id:line.thaanId,soldSuits:updated.suits,saleId:{$exists:false}},{$set:{saleId:id}},{session})
          }
          const um = count * (updated.totalUm / updated.suits)
          if (!Number.isSafeInteger(um)) throw new BusinessError(409,'Suit length cannot be represented exactly')
          items.push({
            id: updated._id, grade: updated.contents.map(item => item.grade).join('/'), suits: count, totalUm: um,
            lotId: updated.lotId, orderId: updated.orderId, batchId: updated.batchId,
            fullThaan: existingSold === 0 && count === updated.suits && count === updated.defaultTargetSuits,
          })
        }
        if (customer) {
          entries.push({account:customer,date:entryDate,voucherNo:doc.reference,
            description:'Finished fabric sold '+items.map(line=>line.id+' ('+line.suits+' suits)').join(', '),debit:total,credit:0,
            meta:{source:id,kind:'sale'},createdAt:postedAt,updatedAt:postedAt})
          if (paid) entries.push({account:customer,date:entryDate,voucherNo:doc.reference,
            description:'Received at sale ('+paymentMethod+')',debit:0,credit:paid,
            meta:{source:id,kind:'sale-payment',method:paymentMethod},createdAt:postedAt,updatedAt:postedAt})
        }
        // Walk-in cash sales are in checkout_documents and the POS cash/bank register;
        // they do NOT create fictitious customer receivables.
      } else {
        if (!customer) throw new BusinessError(400,'Customer required for Udhar repayment')
        paid = doc.amount
        paymentMethod = doc.method
        if (previousDue < paid) throw new BusinessError(409, 'Payment exceeds outstanding balance')
        entries.push({account:customer,date:entryDate,voucherNo:doc.reference,
          description:'Udhar payment received ('+paymentMethod+')',debit:0,credit:paid,
          meta:{source:id,kind:'payment',method:paymentMethod},createdAt:postedAt,updatedAt:postedAt})
      }
      if (entries.length) await transactions.insertMany(entries, {session})
      if (paid && paymentMethod) {
        await receipts.insertOne({_id:id,sourceId:id,reference:doc.reference,date:doc.date,amount:paid,
          method:paymentMethod,partyName:customerName,walkIn:!customer,kind:doc.kind,actor:actor.email,postedAt}, {session})
      }
      await records.insertOne({_id:id,kind:doc.kind,reference:doc.reference,
        partyId:customer ? String(customer) : undefined,partyName:customerName,walkIn:!customer,
        date:doc.date,total,paid,method:paymentMethod,
        thaanIds:doc.kind==='sale'?items.map(item=>item.id):[],items,
        actor:actor.email,postedAt,fingerprint},{session})
      return false
    })
    return Response.json({id,replayed}, {status:replayed?200:201})
  } catch (error) {
    if (error instanceof BusinessError) return apiError(error.status, error.message)
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      const prior = await records.findOne({_id:id})
      if (prior?.fingerprint === fingerprint) return Response.json({id,replayed:true}, {status:200})
      return apiError(409, 'Document reference already exists')
    }
    return apiError(503, 'Posting not confirmed. Retry the same reference and values')
  }
})
