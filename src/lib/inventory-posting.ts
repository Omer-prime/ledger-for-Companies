import { Types } from 'mongoose'
import { z } from 'zod'
import { getSession, digest } from '@/lib/auth'
import { amount, apiError, dateOnly, id, readBody, requirePermission } from '@/lib/api-security'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import { InventoryMovement } from '@/models/InventoryMovement'

const QUANTITY_SCALE = 1_000_000

const common = {
  date: dateOnly, productId: id.transform(value => value.toLowerCase()), qty: amount.gt(0).max(1e9).refine(qty => Math.round(qty * QUANTITY_SCALE) / QUANTITY_SCALE === qty),
}
const partyId = id.transform(value => value.toLowerCase()).optional()
const opening = z.strictObject({ ...common, avgCost: amount.optional(), note: z.string().max(500).optional() })
const purchase = z.strictObject({
  ...common, type: z.literal('purchase'), partyId, rate: amount, waste: z.union([z.literal(0), common.qty]).optional(),
}).refine(row => (row.waste ?? 0) <= row.qty)
const sale = z.strictObject({ ...common, type: z.literal('sale'), partyId, sellRate: amount.optional() })

const adjustment = z.strictObject({
  ...common, type: z.literal('adjustment'), direction: z.enum(['increase', 'decrease']),
  rate: amount.optional(), reason: z.string().trim().min(1).max(500),
}).refine(row => row.direction === 'increase' ? row.rate !== undefined : row.rate === undefined)

type Movement = {
  type: 'opening' | 'purchase' | 'sale' | 'waste' | 'adjustment'
  date: Date
  productId: Types.ObjectId
  partyId?: Types.ObjectId
  qty: number
  rate?: number
  sellRate?: number
  direction?: 'increase' | 'decrease'
  meta?: { note?: string; reason?: string }
}

class PostingError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function buildMovements(rows: z.infer<typeof opening>[] | z.infer<typeof purchase>[] | z.infer<typeof sale>[] | z.infer<typeof adjustment>[]): Movement[] {
  return rows.flatMap<Movement>(row => {
    const base = { date: new Date(row.date), productId: new Types.ObjectId(row.productId), qty: row.qty }
    if (!('type' in row)) return [{ ...base, type: 'opening', rate: row.avgCost ?? 0, meta: { note: row.note } }]
    if (row.type === 'adjustment') {
      return [{ ...base, type: row.type, direction: row.direction, rate: row.rate, meta: { reason: row.reason } }]
    }
    const counterparty = row.partyId ? new Types.ObjectId(row.partyId) : undefined
    if (row.type === 'sale') return [{ ...base, type: 'sale', partyId: counterparty, sellRate: row.sellRate }]
    const movements: Movement[] = [{ ...base, type: 'purchase', partyId: counterparty, rate: row.rate }]
    if (row.waste) movements.push({ ...base, type: 'waste', partyId: counterparty, qty: row.waste })
    return movements
  })
}

export async function postInventory(req: Request, kind: 'opening' | 'purchase' | 'sale' | 'adjustment') {
  try {
    const denied = await requirePermission('inventoryPost', req)
    if (denied) return denied
    const actor = await getSession()
    if (!actor) return apiError(401, 'Unauthorized')
    const key = req.headers.get('Idempotency-Key')
    if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) return apiError(400, 'Invalid idempotency key')

    const schemas = { opening, purchase, sale, adjustment }
    // Strip deprecated calculated metadata before validation and fingerprinting.
    const schema = z.strictObject({
      documentNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/).optional(),
      rows: z.array(z.preprocess(value => {
        if ((kind === 'opening' || kind === 'adjustment') || !value || typeof value !== 'object' || Array.isArray(value)) return value
        const fields = { ...value } as Record<string, unknown>
        delete fields.meta
        return fields
      }, schemas[kind])).min(1).max(500),
    })
    const body = await readBody(req, schema)
    if (!body) return apiError(400, 'Invalid inventory payload')
    if ((kind === 'purchase' || kind === 'sale') && !body.documentNumber) return apiError(400, 'Document number required')
    const movements = buildMovements(body.rows)
    const fingerprint = digest(JSON.stringify({ kind, movements }))
    const requestId = digest(JSON.stringify(['inventory', actor.email, key]))
    const documentNumber = body.documentNumber
    const eventId = documentNumber ? digest(JSON.stringify(['inventory-document', kind, documentNumber])) : requestId
    const connection = (await dbConnect()).connection
    const events = connection.collection<{ _id: string; fingerprint: string; inserted: number; actor: string; postedAt: Date; kind?: string; documentNumber?: string }>('inventory_postings')
    const requests = connection.collection<{ _id: string; eventId: string }>('inventory_requests')
    const balances = connection.collection<{ _id: Types.ObjectId; qtyUnits: number; hasOpening: boolean; lastDate: Date | null }>('inventory_balances')
    const postedAt = new Date()
    const result = await connection.transaction(async session => {
      const request = await requests.findOne({ _id: requestId }, { session })
      const legacyRequest = !request && requestId !== eventId
        ? await events.findOne({ _id: requestId }, { session })
        : null
      if ((request && request.eventId !== eventId) || legacyRequest) {
        throw new PostingError(409, 'Idempotency key already used')
      }
      const prior = await events.findOne({ _id: eventId }, { session })
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new PostingError(409, 'Posting identifier already used with different data')
        if (!request) await requests.insertOne({ _id: requestId, eventId }, { session })
        return { inserted: prior.inserted, eventId }
      }

      const products = [...new Set(movements.map(row => String(row.productId)))].sort()
      const parties = [...new Set(movements.flatMap(row => row.partyId ? [String(row.partyId)] : []))]
      if (await Account.countDocuments({ _id: { $in: parties }, type: 'party', archivedAt: null }).session(session) !== parties.length) {
        throw new PostingError(400, 'Unknown or archived party')
      }
      for (const productId of products) {
        const product = new Types.ObjectId(productId)
        // A write to the product serializes initialization and races with archive.
        const locked = await Account.collection.updateOne(
          { _id: product, type: 'product', archivedAt: null },
          { $inc: { inventoryVersion: 1 } }, { session },
        )
        if (!locked.matchedCount) throw new PostingError(400, 'Unknown or archived product')
        if (!(await balances.findOne({ _id: product }, { session }))) {
          const [legacy] = await InventoryMovement.aggregate<{ qtyUnits: number; hasOpening: number; lastDate: Date }>([
            { $match: { productId: product } },
            { $group: {
              _id: null,
              qtyUnits: { $sum: { $multiply: [QUANTITY_SCALE, '$qty', { $cond: [{ $or: [{ $in: ['$type', ['opening', 'purchase']] }, { $and: [{ $eq: ['$type', 'adjustment'] }, { $eq: ['$direction', 'increase'] }] }] }, 1, -1] }] } },
              lastDate: { $max: '$date' },
              hasOpening: { $max: { $cond: [{ $eq: ['$type', 'opening'] }, 1, 0] } },
            } },
          ]).session(session)
          const qtyUnits = Math.round(legacy?.qtyUnits ?? 0)
          if (!Number.isSafeInteger(qtyUnits)) throw new PostingError(409, 'Legacy stock requires reconciliation')
          await balances.insertOne({ _id: product, qtyUnits, hasOpening: Boolean(legacy?.hasOpening), lastDate: legacy?.lastDate ?? null }, { session })
        }
        for (const row of movements.filter(row => row.productId.equals(product)).sort((a, b) => a.date.getTime() - b.date.getTime())) {
          const opening = row.type === 'opening'
          const outgoing = row.type === 'sale' || row.type === 'waste' || (row.type === 'adjustment' && row.direction === 'decrease')
          const units = Math.round(row.qty * QUANTITY_SCALE)
          const updated = await balances.updateOne({
            _id: product,
            ...(opening ? { hasOpening: false } : {}),
            $or: [{ lastDate: null }, { lastDate: { $lte: row.date } }],
            qtyUnits: outgoing ? { $gte: units } : { $lte: Number.MAX_SAFE_INTEGER - units },
          }, {
            $inc: { qtyUnits: outgoing ? -units : units },
            $set: { lastDate: row.date, ...(opening ? { hasOpening: true } : {}) },
          }, { session })
          if (!updated.matchedCount) {
            const current = await balances.findOne({ _id: product }, { session })
            if (opening && current?.hasOpening) throw new PostingError(409, 'Opening stock already posted')
            if (current?.lastDate && current.lastDate > row.date) throw new PostingError(409, 'Movement precedes latest stock posting')
            throw new PostingError(409, outgoing ? 'Insufficient stock' : 'Stock quantity exceeds supported range')
          }
        }
      }

      await InventoryMovement.insertMany(movements.map((movement, sequence) => ({
        ...movement, eventId, sequence, actor: actor.email, postedAt,
      })), { session })
      await events.insertOne({ _id: eventId, fingerprint, inserted: movements.length, actor: actor.email, postedAt, kind, documentNumber }, { session })
      await requests.insertOne({ _id: requestId, eventId }, { session })
      return { inserted: movements.length, eventId }
    })
    return Response.json(result, { status: kind === 'opening' ? 200 : 201 })
  } catch (error) {
    if (error instanceof PostingError) return apiError(error.status, error.message)
    // Concurrent reuse across disjoint products can conflict on the event key.
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
      return apiError(409, 'Concurrent posting conflict; retry with the same key')
    }
    return apiError(503, 'Inventory posting unavailable')
  }
}
