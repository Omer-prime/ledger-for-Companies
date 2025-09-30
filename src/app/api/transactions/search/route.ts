import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Transaction, type ITransaction } from '@/models/Transaction'
import mongoose from 'mongoose'

export async function GET(req: Request) {
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const partyId = searchParams.get('partyId')
  const categoryId = searchParams.get('categoryId')
  const limit = Math.min(Number(searchParams.get('limit') || 500), 2000)

  const match: Record<string, unknown> = {}

  if (q) match.description = { $regex: q, $options: 'i' }

  if (from || to) {
    const dateCond: Record<string, unknown> = {}
    if (from) dateCond.$gte = new Date(from)
    if (to) dateCond.$lte = new Date(to)
    match.date = dateCond
  }

  if (partyId && mongoose.Types.ObjectId.isValid(partyId)) {
    match.account = new mongoose.Types.ObjectId(partyId)
  }

  if (categoryId) match['meta.categoryId'] = categoryId

  const rows = await Transaction.find(match)
    .sort({ date: 1 })
    .limit(limit)
    .lean<
      Array<
        Pick<ITransaction, 'date' | 'debit' | 'credit' | 'description' | 'voucherNo' | 'meta'>
      >
    >()

  const totals = rows.reduce<{ debit: number; credit: number }>(
    (acc, r) => {
      acc.debit += Number(r.debit || 0)
      acc.credit += Number(r.credit || 0)
      return acc
    },
    { debit: 0, credit: 0 }
  )

  return NextResponse.json({ rows, totals })
}
