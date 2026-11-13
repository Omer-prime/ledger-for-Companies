import { apiError, dateOnly, readBody, requirePermission, safeApi } from '@/lib/api-security'
import { getSession } from '@/lib/auth'
import { dbConnect } from '@/lib/db'
import { approvalSchema, posAccounting } from '@/lib/pos-accounting'
import { Account } from '@/models/Account'
import { textileProduction } from '@/models/TextileProduction'

export const GET = safeApi(async function GET(req: Request) {
  const denied = await requirePermission('configure')
  if (denied) return denied
  const conn = (await dbConnect()).connection
  const day = new URL(req.url).searchParams.get('date')
  if (day !== null) {
    if (!dateOnly.safeParse(day).success) return apiError(400, 'Invalid reconciliation date')
    const journal = await conn.collection('journal_entries').aggregate([
      { $match: { effectiveDate: day, 'source.system': 'pos' } },
      { $unwind: '$lines' },
      { $group: {
        _id: '$lines.accountId',
        debitPaisa: { $sum: { $toDecimal: '$lines.debitPaisa' } },
        creditPaisa: { $sum: { $toDecimal: '$lines.creditPaisa' } },
      } },
      { $project: { debitPaisa: { $toString: '$debitPaisa' }, creditPaisa: { $toString: '$creditPaisa' } } },
      { $sort: { _id: 1 } },
    ]).toArray()
    return Response.json({ date: day, journal }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const [latest, accounts] = await Promise.all([
    posAccounting(conn).findOne({}, { sort: { _id: -1 } }),
    Account.find({ type: 'gl', archivedAt: null }).select('name code').sort({ name: 1 }).lean(),
  ])
  return Response.json({ revision: latest?._id ?? 0, approval: latest?.approval ?? null, accounts }, { headers: { 'Cache-Control': 'no-store' } })
})

export const PUT = safeApi(async function PUT(req: Request) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
  const actor = await getSession()
  if (!actor) return apiError(401, 'Unauthorized')
  const body = await readBody(req, approvalSchema)
  if (!body) return apiError(400, 'Invalid accounting approval')
  const conn = (await dbConnect()).connection
  const revisions = posAccounting(conn)
  const latest = await revisions.findOne({}, { sort: { _id: -1 } })
  if ((latest?._id ?? 0) !== body.revision) return apiError(409, 'Approval changed. Reload and try again.')
  if (body.approval) {
    const ids = Object.values(body.approval.accounts)
    if (new Set(ids).size !== ids.length || await Account.countDocuments({ _id: { $in: ids }, type: 'gl', archivedAt: null }) !== ids.length) {
      return apiError(400, 'Choose six distinct, active general-ledger accounts')
    }
    const orders = body.approval.capitalizedOrderIds
    if (await textileProduction(conn).orders.countDocuments({ _id: { $in: orders }, 'completion.batchId': { $exists: true }, currency: 'PKR', minorPerMeter: { $gt: 0 } }) !== orders.length) {
      return apiError(400, 'Capitalization references must be completed PKR cutting orders with positive cost')
    }
  }
  try {
    await revisions.insertOne({ _id: body.revision + 1, approval: body.approval, actor: actor.email, approvedAt: new Date() })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) return apiError(409, 'Approval changed. Reload and try again.')
    throw error
  }
  return Response.json({ revision: body.revision + 1, approval: body.approval })
})
