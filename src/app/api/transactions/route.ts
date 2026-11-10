import { businessDateRange } from '@/lib/business-dates'
import { amount, apiError, dateOnly, id, readBody, requirePermission, text, validateQuery, safeApi } from '@/lib/api-security'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Transaction, type ITransaction } from '@/models/Transaction'
import { Account } from '@/models/Account'
import { LedgerCategory } from '@/models/LedgerCategory'
import mongoose from 'mongoose'
import { computeRunning, groupTotals, type LedgerRow } from '@/lib/ledger'

type Period = 'day' | 'month'

// light shapes for queries/compute
type TxPre  = Pick<ITransaction, 'date' | 'debit' | 'credit'>
type TxLite = Pick<ITransaction, 'date' | 'debit' | 'credit' | 'description' | 'voucherNo' | 'meta'>

export const GET = safeApi(async function GET(req: Request) {
  const denied = await requirePermission('read')
  if (denied) return denied
  if (!validateQuery(req)) return apiError(400, 'Invalid query')
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId') ?? ''
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const period = (searchParams.get('period') as Period) || 'day'

  if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
    return NextResponse.json({ opening: 0, rows: [], totals: { period, items: [] } })
  }

  const acc = await Account.findById(accountId).lean()
  if (!acc) {
    return NextResponse.json({ opening: 0, rows: [], totals: { period, items: [] } })
  }

  const { start: fromDate, end: toDate } = businessDateRange(from, to)

  // Opening = signed openingBalance + all tx before "from"
  const signedOpening = Number(acc.openingBalance || 0) * (acc.openingIsDebit ? 1 : -1)

  const preMatch: Record<string, unknown> = { account: new mongoose.Types.ObjectId(accountId) }
  if (fromDate) preMatch.date = { $lt: fromDate }

  const preRows = !fromDate ? [] : await Transaction.find(preMatch, { debit: 1, credit: 1, date: 1 })
    .sort({ date: 1, _id: 1 })
    .lean<TxPre[]>()

  const preNet = preRows.reduce((s, r) => s + Number(r.debit || 0) - Number(r.credit || 0), 0)
  const opening = signedOpening + preNet

  // Range rows
  const rangeMatch: Record<string, unknown> = { account: new mongoose.Types.ObjectId(accountId) }
  if (fromDate || toDate) {
    const dateCond: Record<string, unknown> = {}
    if (fromDate) dateCond.$gte = fromDate
    if (toDate) dateCond.$lt = toDate
    rangeMatch.date = dateCond
  }

  const rows = await Transaction.find(rangeMatch, {
    date: 1, voucherNo: 1, description: 1, debit: 1, credit: 1, meta: 1,
  })
    .sort({ date: 1, _id: 1 })
    .lean<TxLite[]>()

  const running: LedgerRow[] = computeRunning(rows, opening)
  const totals = groupTotals(running, period)

  const closing = rows.reduce((balance, row) => balance + Number(row.debit ?? 0) - Number(row.credit ?? 0), opening)
  return NextResponse.json({ opening, closing, rows: running, totals })
})

// keep your POST as-is (creating a single transaction)
export const POST = safeApi(async function POST(req: Request) {
  const denied = await requirePermission('post', req)
  if (denied) return denied
  await dbConnect()
  const body = await readBody(req, z.strictObject({
    accountId: id.optional(), categoryId: id.transform(value => value.toLowerCase()).optional(), date: dateOnly.optional(),
    voucherNo: text.optional(), description: text.optional(), debit: amount.optional(), credit: amount.optional(),
  }))
  if (!body) return apiError(400, 'Invalid transaction payload')

  const { accountId, date, voucherNo, description, debit, credit, categoryId } = body

  if (categoryId && !(await LedgerCategory.exists({ _id: categoryId, archivedAt: null }))) {
    return apiError(400, 'Unknown or archived category')
  }

  let acc =
    accountId && mongoose.Types.ObjectId.isValid(accountId)
      ? await Account.findOne({ _id: accountId, archivedAt: null })
      : null

  if (accountId && !acc) return apiError(400, 'Unknown account')
  if (!acc) {
    acc =
      (await Account.findOne({ name: 'Unassigned', type: 'gl', archivedAt: null })) ||
      (await Account.create({ name: 'Unassigned', type: 'gl' }))
  }

  const doc = await Transaction.create({
    account: acc._id,
    date: date ? new Date(date) : new Date(),
    voucherNo: voucherNo || undefined,
    description: description || '',
    debit: Number(debit || 0),
    credit: Number(credit || 0),
    meta: categoryId ? { categoryId } : undefined,
  })

  return NextResponse.json(doc, { status: 201 })
})
