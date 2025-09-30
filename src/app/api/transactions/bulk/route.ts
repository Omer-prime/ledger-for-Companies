import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import { Transaction, type ITransaction } from '@/models/Transaction'
import mongoose, { Types } from 'mongoose'

type IncomingRow = {
  voucherNo?: string
  date?: string
  description?: string
  debit?: number | null
  credit?: number | null
  partyId?: string | null
}

type InsertDoc = Pick<
  ITransaction,
  'date' | 'voucherNo' | 'description' | 'debit' | 'credit' | 'meta'
> & { account: Types.ObjectId }

export async function POST(req: Request) {
  await dbConnect()

  const { categoryId, rows } = (await req.json()) as {
    categoryId?: string
    rows: IncomingRow[]
  }

  if (!rows?.length) return NextResponse.json({ inserted: 0 })

  // Ensure an "Unassigned" GL account for non-party rows
  let unassigned = await Account.findOne({ name: 'Unassigned', type: 'gl' })
  if (!unassigned) {
    unassigned = await Account.create({
      name: 'Unassigned',
      type: 'gl',
      openingBalance: 0,
      openingIsDebit: true,
    })
  }

  const docs: InsertDoc[] = []

  for (const r of rows) {
    const date = r.date ? new Date(r.date) : null
    if (!date) continue

    const debit = Number(r.debit || 0)
    const credit = Number(r.credit || 0)
    const desc = (r.description ?? '').trim()
    const voucher = (r.voucherNo ?? '').trim() || undefined

    // skip truly empty rows (no amounts and no text)
    if (!debit && !credit && !desc && !voucher) continue

    const accountId: Types.ObjectId =
      r.partyId && mongoose.Types.ObjectId.isValid(r.partyId)
        ? new mongoose.Types.ObjectId(r.partyId)
        : unassigned._id as Types.ObjectId

    docs.push({
      account: accountId,
      date,
      voucherNo: voucher,
      description: desc,
      debit,
      credit,
      meta: categoryId ? ({ categoryId } as Record<string, unknown>) : undefined,
    })
  }

  if (!docs.length) return NextResponse.json({ inserted: 0 })

  await Transaction.insertMany(docs)
  return NextResponse.json({ inserted: docs.length })
}
