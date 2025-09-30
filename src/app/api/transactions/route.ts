import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Transaction, type ITransaction } from '@/models/Transaction'
import { Account } from '@/models/Account'
import mongoose from 'mongoose'
import { computeRunning, groupTotals, type LedgerRow } from '@/lib/ledger'

type Period = 'day' | 'month'

// light shapes for queries/compute
type TxPre  = Pick<ITransaction, 'date' | 'debit' | 'credit'>
type TxLite = Pick<ITransaction, 'date' | 'debit' | 'credit' | 'description' | 'voucherNo' | 'meta'>

export async function GET(req: Request) {
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

  const fromDate = from ? new Date(from) : null
  const toDate = to ? new Date(to) : null

  // Opening = signed openingBalance + all tx before "from"
  const signedOpening = Number(acc.openingBalance || 0) * (acc.openingIsDebit ? 1 : -1)

  const preMatch: Record<string, unknown> = { account: new mongoose.Types.ObjectId(accountId) }
  if (fromDate) preMatch.date = { $lt: fromDate }

  const preRows = await Transaction.find(preMatch, { debit: 1, credit: 1, date: 1 })
    .sort({ date: 1, _id: 1 })
    .lean<TxPre[]>()

  const preNet = preRows.reduce((s, r) => s + Number(r.debit || 0) - Number(r.credit || 0), 0)
  const opening = signedOpening + preNet

  // Range rows
  const rangeMatch: Record<string, unknown> = { account: new mongoose.Types.ObjectId(accountId) }
  if (fromDate || toDate) {
    const dateCond: Record<string, unknown> = {}
    if (fromDate) dateCond.$gte = fromDate
    if (toDate) dateCond.$lte = toDate
    rangeMatch.date = dateCond
  }

  const rows = await Transaction.find(rangeMatch, {
    date: 1, voucherNo: 1, description: 1, debit: 1, credit: 1, meta: 1,
  })
    .sort({ date: 1, _id: 1 })
    .lean<TxLite[]>()

  const running: LedgerRow[] = computeRunning(rows, opening)
  const totals = groupTotals(running, period)

  return NextResponse.json({ opening, rows: running, totals })
}

// keep your POST as-is (creating a single transaction)
export async function POST(req: Request) {
  await dbConnect()
  const body: {
    accountId?: string
    date?: string
    voucherNo?: string
    description?: string
    debit?: number
    credit?: number
    categoryId?: string
  } = await req.json()

  const { accountId, date, voucherNo, description, debit, credit, categoryId } = body

  let acc =
    accountId && mongoose.Types.ObjectId.isValid(accountId)
      ? await Account.findById(accountId)
      : null

  if (!acc) {
    acc =
      (await Account.findOne({ name: 'Unassigned', type: 'gl' })) ||
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
}
