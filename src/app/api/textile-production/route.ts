import { z } from 'zod'
import { apiError, readBody, requirePermission, safeApi, text } from '@/lib/api-security'
import { digest, getSession } from '@/lib/auth'
import { defaultBusinessSettings, LENGTH_UNITS_UM } from '@/lib/business-settings'
import { dbConnect } from '@/lib/db'
import { metersToMicrometers, reconcileCutting } from '@/lib/textile-quantities'
import { BusinessSettings } from '@/models/BusinessSettings'
import { textileProduction } from '@/models/TextileProduction'
import { warehouse } from '@/models/Warehouse'

const reference = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/)
const meters = z.string().trim().regex(/^\d{1,9}(?:\.\d{1,6})?$/).transform(metersToMicrometers)
const quantity = z.number().int().min(0).max(1000000)
const grade = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_-]{0,23}$/)
const fields = { reference, orderId: reference }
const commands = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('allocate'), reference, lotId: reference, length: meters, suitLength: meters.optional() }),
  z.strictObject({ kind: z.literal('complete'), ...fields, suits: quantity, quarantined: quantity,
    returned: meters, offcuts: meters, waste: meters, actualSuitLength: meters.optional() }),
  z.strictObject({ kind: z.literal('grade'), ...fields, grade, suits: quantity.min(1) }),
  z.strictObject({ kind: z.literal('regrade'), ...fields, from: grade, grade, suits: quantity.min(1), reason: text.min(1) }),
  // Accept the historical request shape so exact replays still match stored fingerprints.
  z.strictObject({ kind: z.literal('pack'), ...fields, targetSuits: quantity.min(1).max(1000).optional(),
    contents: z.array(z.strictObject({ grade, suits: quantity.min(1).max(1000) })).min(1).max(30) }),
])

class PostingError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export const GET = safeApi(async function GET() {
  const denied = await requirePermission('read')
  if (denied) return denied
  const actor = await getSession()
  const connection = (await dbConnect()).connection
  const { orders, thaans, events } = textileProduction(connection)
  const { lots } = warehouse(connection)
  const data = await connection.transaction(async session => {
    const settings = await BusinessSettings.findOne().sort({ _id: -1 }).session(session).lean()
    const configuration = settings?.settings ?? defaultBusinessSettings
    const totals = { full: 0, partial: 0, nonstandard: 0, packedSuits: 0, unpacked: 0, pending: 0, quarantined: 0 }
    const byGrade: Record<string, number> = {}
    const byLot = new Map<string, { lotId: string; um: bigint }>()
    for await (const order of orders.find({}, { session })) {
      totals.pending += order.unclassified
      totals.quarantined += order.completion?.quarantined ?? 0
      for (const stock of Object.values(order.grades)) totals.unpacked += stock.pending
    }
    for await (const thaan of thaans.find({}, { session })) {
      if (thaan.suits === thaan.defaultTargetSuits) totals.full++
      else if (thaan.suits < thaan.defaultTargetSuits) totals.partial++
      else totals.nonstandard++
      totals.packedSuits += thaan.suits
      for (const item of thaan.contents) byGrade[item.grade] = (byGrade[item.grade] ?? 0) + item.suits
      const lot = byLot.get(thaan.lotId) ?? { lotId: thaan.lotId, um: BigInt(0) }
      lot.um += BigInt(thaan.totalUm)
      byLot.set(thaan.lotId, lot)
    }
    return {
      canPost: Boolean(actor && actor.role !== 'accountant'), totals, byGrade,
      byLot: [...byLot.values()].map(lot => ({ lotId: lot.lotId, um: String(lot.um) })),
      configuration: { grades: configuration.grades.filter(item => item.enabled), thaan: configuration.thaan },
      lots: await lots.find({ 'balances.dyed': { $gt: 0 } }, { session }).sort({ postedAt: -1, _id: 1 }).limit(100).toArray(),
      orders: await orders.find({}, { session }).sort({ createdAt: -1, _id: 1 }).limit(100).toArray(),
      thaans: await thaans.find({}, { session }).sort({ postedAt: -1, _id: 1 }).limit(100).toArray(),
      events: await events.find({}, { session, projection: { fingerprint: 0 } }).sort({ postedAt: -1, _id: 1 }).limit(100).toArray(),
    }
  }, { readConcern: { level: 'snapshot' } })
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
})

export const POST = safeApi(async function POST(req: Request) {
  const denied = await requirePermission('inventoryPost', req)
  if (denied) return denied
  const actor = await getSession()
  if (!actor || actor.role === 'accountant') return apiError(403, 'Forbidden')
  const body = await readBody(req, commands)
  if (!body) return apiError(400, 'Invalid production document')
  const connection = (await dbConnect()).connection
  const { orders, thaans, events } = textileProduction(connection)
  const { lots } = warehouse(connection)
  const eventId = body.kind + ':' + body.reference
  const fingerprint = digest(JSON.stringify(body))
  try {
    const replayed = await connection.transaction(async session => {
      const previous = await events.findOne({ _id: eventId }, { session })
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new PostingError(409, 'Document reference already used with different data')
        return true
      }
      const settings = await BusinessSettings.findOne().sort({ _id: -1 }).session(session).lean()
      const configuration = settings?.settings ?? defaultBusinessSettings
      const revision = settings?._id ?? 0
      const postedAt = new Date()
      const orderId = body.kind === 'allocate' ? body.reference : body.orderId
      let lotId: string
      let document: Record<string, unknown> = body
      if (body.kind === 'allocate') {
        const suitLengthUm = body.suitLength ?? Math.round(configuration.thaan.metersPerSuit * LENGTH_UNITS_UM.m)
        if (!body.length || !suitLengthUm || suitLengthUm > 10000000000) throw new PostingError(400, 'Enter a positive allocation and suit length up to 10,000 m')
        const lot = await lots.findOneAndUpdate({ _id: body.lotId, 'balances.dyed': { $gte: body.length } }, {
          $inc: { 'balances.dyed': -body.length },
        }, { session, returnDocument: 'after' })
        if (!lot) throw new PostingError(409, 'Insufficient dyed fabric for this lot')
        lotId = lot._id
        document = { ...body, suitLengthUm, from: 'dyed', to: 'cutting' }
        await orders.insertOne({
          _id: orderId, lotId, allocatedUm: body.length, suitLengthUm, revision,
          currency: lot.currency, minorPerMeter: lot.minorPerMeter, createdAt: postedAt, unclassified: 0, grades: {},
        }, { session })
      } else {
        const order = await orders.findOne({ _id: orderId }, { session })
        if (!order) throw new PostingError(404, 'Cutting order not found')
        lotId = order.lotId
        if (body.kind === 'complete') {
          if (order.completion) throw new PostingError(409, 'Cutting order already completed')
          const suitLengthUm = body.actualSuitLength ?? order.suitLengthUm
          if (!suitLengthUm || suitLengthUm > 10000000000) throw new PostingError(400, 'Enter an actual suit length up to 10,000 m')
          let consumedUm: number
          try {
            consumedUm = reconcileCutting(order.allocatedUm, suitLengthUm, body.suits, body.quarantined, body.returned, body.offcuts, body.waste)
          } catch (error) {
            throw new PostingError(400, (error as Error).message)
          }
          if (body.returned) {
            const returned = await lots.updateOne({ _id: lotId }, { $inc: { 'balances.dyed': body.returned } }, { session })
            if (!returned.matchedCount) throw new PostingError(409, 'Source lot requires reconciliation')
          }
          order.completion = {
            batchId: body.reference, suitLengthUm, suits: body.suits, quarantined: body.quarantined, returnedUm: body.returned,
            offcutsUm: body.offcuts, wasteUm: body.waste, consumedUm,
          }
          order.unclassified = body.suits
          document = { ...body, ...order.completion }
        } else {
          if (!order.completion) throw new PostingError(409, 'Complete cutting before grading or packing')
          if (body.kind === 'grade' || body.kind === 'regrade') {
            const selected = configuration.grades.find(item => item.enabled && item.code === body.grade)
            if (!selected) throw new PostingError(400, 'Select an active grade')
            if (body.kind === 'grade') {
              if (order.unclassified < body.suits) throw new PostingError(409, 'Insufficient unclassified suits')
              order.unclassified -= body.suits
            } else {
              const source = order.grades[body.from]
              if (body.from === body.grade || !source || source.pending < body.suits) {
                throw new PostingError(409, 'Correction requires unpacked suits from a different grade')
              }
              source.pending -= body.suits
            }
            const stock = order.grades[body.grade] ?? { pending: 0, packed: 0, label: selected.label }
            stock.pending += body.suits
            order.grades[body.grade] = stock
            document = { ...body, gradeLabel: selected.label }
          } else {
            if (body.targetSuits !== undefined) {
              throw new PostingError(400, 'Packing target is set by Business Settings')
            }
            if (body.contents.length !== 1) {
              throw new PostingError(400, 'A thaan must contain suits of one grade')
            }
            const targetSuits = configuration.thaan.suitsPerThaan
            const item = body.contents[0]
            const { suits } = item
            if (suits > targetSuits) throw new PostingError(400, 'Suit count exceeds the standard thaan size')
            const stock = order.grades[item.grade]
            if (!stock || stock.pending < suits) throw new PostingError(409, 'Insufficient unpacked suits for grade ' + item.grade)
            stock.pending -= suits
            stock.packed += suits
            const contents = [{ ...item, label: stock.label }]
            const suitLengthUm = order.completion.suitLengthUm
            const totalUm = suitLengthUm * suits
            document = { ...body, contents, targetSuits, suits, suitLengthUm, totalUm }
            await thaans.insertOne({
              _id: body.reference, orderId, batchId: order.completion.batchId, lotId, contents, suits, targetSuits,
              defaultTargetSuits: configuration.thaan.suitsPerThaan,
              defaultSuitLengthUm: Math.round(configuration.thaan.metersPerSuit * LENGTH_UNITS_UM.m),
              suitLengthUm, totalUm, revision, actor: actor.email, postedAt,
            }, { session })
          }
        }
        // Concurrent writers update the same order, causing MongoDB to retry stale transactions.
        await orders.replaceOne({ _id: orderId }, order, { session })
      }
      await events.insertOne({ _id: eventId, fingerprint, orderId, lotId, revision, actor: actor.email, postedAt, document }, { session })
      return false
    })
    return Response.json({ eventId, replayed }, { status: replayed ? 200 : 201 })
  } catch (error) {
    if (error instanceof PostingError) return apiError(error.status, error.message)
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
      const previous = await events.findOne({ _id: eventId })
      if (previous?.fingerprint === fingerprint) return Response.json({ eventId, replayed: true })
      return apiError(409, 'Document reference already used')
    }
    throw error
  }
})
