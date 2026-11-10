import { z } from 'zod'
import { apiError, id, readBody, requirePermission, safeApi, text } from '@/lib/api-security'
import { digest, getSession } from '@/lib/auth'
import { defaultBusinessSettings, LENGTH_UNITS_UM } from '@/lib/business-settings'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import { BusinessSettings } from '@/models/BusinessSettings'
import { warehouse, type Leg } from '@/models/Warehouse'

const reference = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/)
const length = z.string().trim().regex(/^\d{1,9}(?:\.\d{1,6})?$/)
const fields = { reference, unit: z.enum(['m', 'yd']) }
const command = z.discriminatedUnion('kind', [
  z.strictObject({ ...fields, kind: z.literal('receipt'), supplierId: id, fabric: text.min(1), quantity: length, minorPerMeter: z.number().int().nonnegative().max(1e9) }),
  z.strictObject({ ...fields, kind: z.literal('dispatch'), processorId: id, lotId: reference, quantity: length }),
  z.strictObject({ ...fields, kind: z.literal('return'), jobId: reference, dyed: length, damaged: length, rejected: length, lost: length, reason: text.optional() }),
])
const outcomes = ['dyed', 'damaged', 'rejected', 'lost'] as const

function convert(value: string, unit: 'm' | 'yd') {
  const [whole, fraction = ''] = value.split('.')
  const scale = BigInt(10 ** fraction.length)
  const numerator = BigInt(whole + fraction) * BigInt(LENGTH_UNITS_UM[unit])
  if (numerator % scale !== BigInt(0)) throw new Error('Sub-micrometer quantity')
  return Number(numerator / scale)
}

class Rejected extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export const GET = safeApi(async function GET() {
  const denied = await requirePermission('read')
  if (denied) return denied
  const actor = await getSession()
  const connection = (await dbConnect()).connection
  const { lots, jobs, events } = warehouse(connection)
  const data = await connection.transaction(async session => {
    const balances = await lots.aggregate([
      { $project: { currency: 1, minorPerMeter: 1, balances: { $objectToArray: '$balances' } } },
      { $unwind: '$balances' },
      { $group: {
        _id: { currency: '$currency', stage: '$balances.k' },
        um: { $sum: { $toDecimal: '$balances.v' } },
        valueNumerator: { $sum: { $multiply: [{ $toDecimal: '$balances.v' }, '$minorPerMeter'] } },
      } },
      { $project: { um: { $toString: '$um' }, valueNumerator: { $toString: '$valueNumerator' } } },
    ], { session }).toArray()
    return {
      balances,
      canPost: Boolean(actor && actor.role !== 'accountant'),
      lots: await lots.find({}, { session }).sort({ postedAt: -1, _id: 1 }).limit(100).toArray(),
      jobs: await jobs.find({ outstandingUm: { $gt: 0 } }, { session }).sort({ postedAt: -1, _id: 1 }).limit(100).toArray(),
      outstandingJobs: await jobs.countDocuments({ outstandingUm: { $gt: 0 } }, { session }),
      events: await events.find({}, { session, projection: { fingerprint: 0 } }).sort({ postedAt: -1, _id: 1 }).limit(100).toArray(),
      accounts: await Account.find({ type: { $in: ['supplier', 'party'] }, archivedAt: null }).select('name').sort({ name: 1 }).session(session).lean(),
    }
  }, { readConcern: { level: 'snapshot' } })
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
})

export const POST = safeApi(async function POST(req: Request) {
  const denied = await requirePermission('inventoryPost', req)
  if (denied) return denied
  const actor = await getSession()
  if (!actor || actor.role === 'accountant') return apiError(403, 'Forbidden')
  const body = await readBody(req, command)
  if (!body) return apiError(400, 'Invalid warehouse document')

  let legs: Leg[]
  try {
    if (body.kind === 'return') {
      legs = outcomes.map<Leg>(to => ({ from: 'processor', to, um: convert(body[to], body.unit) })).filter(leg => leg.um > 0)
    } else {
      legs = [{
        from: body.kind === 'receipt' ? 'supplier' : 'greige',
        to: body.kind === 'receipt' ? 'greige' : 'processor',
        um: convert(body.quantity, body.unit),
      }]
    }
  } catch {
    return apiError(400, 'Enter a length representable in whole micrometers')
  }
  const total = legs.reduce((sum, leg) => sum + leg.um, 0)
  if (!Number.isSafeInteger(total) || total <= 0) return apiError(400, 'Positive fabric length required')
  if (body.kind === 'return' && legs.some(leg => leg.to !== 'dyed') && !body.reason) {
    return apiError(400, 'A reason is required for loss, damage or rejection')
  }

  const connection = (await dbConnect()).connection
  const { lots, jobs, events } = warehouse(connection)
  const eventId = body.kind + ':' + body.reference
  const fingerprint = digest(JSON.stringify(body))
  try {
    const replayed = await connection.transaction(async session => {
      const previous = await events.findOne({ _id: eventId }, { session })
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Rejected(409, 'Reference already used with different data')
        return true
      }
      const settings = await BusinessSettings.findOne().sort({ _id: -1 }).session(session).lean()
      const revision = settings?._id ?? 0
      const postedAt = new Date()
      let lotId: string
      let jobId: string | undefined
      if (body.kind === 'receipt') {
        const supplier = await Account.findOne({ _id: body.supplierId, type: { $in: ['supplier', 'party'] }, archivedAt: null }).session(session).lean()
        if (!supplier) throw new Rejected(400, 'Select an active supplier')
        lotId = body.reference
        await lots.insertOne({
          _id: lotId, supplierId: String(supplier._id), supplier: supplier.name, fabric: body.fabric,
          receivedUm: total, balances: { greige: total, processor: 0, dyed: 0, damaged: 0, rejected: 0, lost: 0 },
          minorPerMeter: body.minorPerMeter, currency: settings?.settings.localization.currency ?? defaultBusinessSettings.localization.currency,
          revision, postedAt,
        }, { session })
      } else if (body.kind === 'dispatch') {
        const processor = await Account.findOne({ _id: body.processorId, type: { $in: ['supplier', 'party'] }, archivedAt: null }).session(session).lean()
        if (!processor) throw new Rejected(400, 'Select an active dyeing processor')
        lotId = body.lotId
        jobId = body.reference
        const moved = await lots.updateOne({ _id: lotId, 'balances.greige': { $gte: total } }, {
          $inc: { 'balances.greige': -total, 'balances.processor': total },
        }, { session })
        if (!moved.matchedCount) throw new Rejected(409, 'Insufficient greige stock for this lot')
        await jobs.insertOne({
          _id: jobId, lotId, processorId: String(processor._id), processor: processor.name,
          dispatchedUm: total, outstandingUm: total, revision, postedAt,
        }, { session })
      } else {
        jobId = body.jobId
        const job = await jobs.findOneAndUpdate({ _id: jobId, outstandingUm: { $gte: total } }, {
          $inc: { outstandingUm: -total },
        }, { session, returnDocument: 'after' })
        if (!job) throw new Rejected(409, 'Return exceeds outstanding fabric')
        lotId = job.lotId
        const changes = Object.fromEntries(legs.map(leg => ['balances.' + leg.to, leg.um]))
        const moved = await lots.updateOne({ _id: lotId, 'balances.processor': { $gte: total } }, {
          $inc: { 'balances.processor': -total, ...changes },
        }, { session })
        if (!moved.matchedCount) throw new Rejected(409, 'Processor balance requires reconciliation')
      }
      await events.insertOne({
        _id: eventId, fingerprint, lotId, jobId, legs, revision, actor: actor.email, postedAt,
        ...(body.kind === 'return' && body.reason ? { reason: body.reason } : {}),
      }, { session })
      return false
    })
    return Response.json({ eventId, replayed }, { status: replayed ? 200 : 201 })
  } catch (error) {
    if (error instanceof Rejected) return apiError(error.status, error.message)
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
      const previous = await events.findOne({ _id: eventId })
      if (previous?.fingerprint === fingerprint) return Response.json({ eventId, replayed: true })
      return apiError(409, 'Warehouse reference already used')
    }
    throw error
  }
})
