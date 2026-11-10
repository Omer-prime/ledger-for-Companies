import { amount, apiError, dateOnly, id, readBody, requirePermission, text, safeApi } from '@/lib/api-security'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import { LedgerCategory } from '@/models/LedgerCategory'
import { Transaction, type ITransaction } from '@/models/Transaction'
import { Types } from 'mongoose'

type InsertDoc = Pick<
  ITransaction,
  'date' | 'voucherNo' | 'description' | 'debit' | 'credit' | 'meta'
> & { account: Types.ObjectId }

export const POST = safeApi(async function POST(req: Request) {
  const denied = await requirePermission('post', req)
  if (denied) return denied
  await dbConnect()

  const body = await readBody(req, z.strictObject({
    categoryId: id.transform(value => value.toLowerCase()).optional(),
    rows: z.array(z.strictObject({
      date: z.union([dateOnly, z.literal('')]).optional(), voucherNo: text.optional(), description: text.optional(),
      debit: amount.nullish(), credit: amount.nullish(), partyId: id.nullish(),
      meta: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), z.union([text, z.number().finite().max(1e12).min(-1e12), z.null()])).optional(),
    })).max(500),
  }))
  if (!body) return apiError(400, 'Invalid transaction payload')
  const { categoryId, rows } = body
  if (categoryId && !(await LedgerCategory.exists({ _id: categoryId, archivedAt: null }))) {
    return apiError(400, 'Unknown or archived category')
  }

  const partyIds = [...new Set(rows.flatMap(row => row.partyId ? [row.partyId.toLowerCase()] : []))]
  if (await Account.countDocuments({ _id: { $in: partyIds }, archivedAt: null }) !== partyIds.length) {
    return apiError(400, 'Unknown party')
  }
  if (rows.some(row => !row.date && (row.debit || row.credit || row.description || row.voucherNo))) {
    return apiError(400, 'Transaction date is required')
  }

  if (!rows?.length) return NextResponse.json({ inserted: 0 })

  // Ensure an "Unassigned" GL account for non-party rows
  let unassigned = await Account.findOne({ name: 'Unassigned', type: 'gl', archivedAt: null })
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
      r.partyId
        ? new Types.ObjectId(r.partyId)
        : unassigned._id as Types.ObjectId

    docs.push({
      account: accountId,
      date,
      voucherNo: voucher,
      description: desc,
      debit,
      credit,
      meta: categoryId ? { categoryId } : undefined,
    })
  }

  if (!docs.length) return NextResponse.json({ inserted: 0 })

  await Transaction.insertMany(docs)
  return NextResponse.json({ inserted: docs.length })
})
