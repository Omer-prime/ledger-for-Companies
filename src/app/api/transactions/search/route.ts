import { apiError, escapeRegex, requirePermission, validateQuery } from '@/lib/api-security'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { dbConnect } from '@/lib/db'
import { Transaction } from '@/models/Transaction'

export const dynamic = 'force-dynamic'

function toObjectId(id?: string | null): mongoose.Types.ObjectId | null {
  if (!id) return null
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
}

// Lean doc shape we expect back from Mongo
type TxLean = {
  _id: mongoose.Types.ObjectId
  date: Date
  voucherNo?: string
  description?: string
  debit?: number
  credit?: number
  meta?: Record<string, unknown> | null
}

type RowOut = {
  _id: string
  date: Date
  voucherNo: string
  description: string
  debit: number
  credit: number
  meta: Record<string, unknown>
}

export async function GET(req: Request) {
  const denied = await requirePermission('read')
  if (denied) return denied
  if (!validateQuery(req)) return apiError(400, 'Invalid query')
  await dbConnect()
  const { searchParams } = new URL(req.url)

  const q = (searchParams.get('q') || '').trim()
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const partyId = searchParams.get('partyId')
  const categoryId = searchParams.get('categoryId')

  const limitRaw = Number(searchParams.get('limit') || '500')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 500

  // Build a safe query with AND of optional pieces
  const and: Record<string, unknown>[] = []

  if (q) {
    and.push({
      $or: [
        { description: { $regex: escapeRegex(q), $options: 'i' } },
        { voucherNo:   { $regex: escapeRegex(q), $options: 'i' } },
      ],
    })
  }

  if (from || to) {
    const dateCond: Record<string, unknown> = {}
    if (from) dateCond.$gte = new Date(from)
    if (to) {
      const end = new Date(to)
      end.setUTCDate(end.getUTCDate() + 1)
      dateCond.$lt = end
    }
    and.push({ date: dateCond })
  }

  // Party filter — support both `accountId` and `account` field names
  const partyOid = toObjectId(partyId)
  if (partyOid) {
    and.push({ $or: [{ accountId: partyOid }, { account: partyOid }] })
  }

  // Category filter — support top-level `categoryId` and legacy `meta.categoryId`
  if (categoryId) {
    const catOid = toObjectId(categoryId)
    and.push({
      $or: [
        { categoryId: catOid ?? categoryId },
        { 'meta.categoryId': categoryId },
      ],
    })
  }

  const match = and.length ? { $and: and } : {}

  // Always select meta so meta.totalDue is available
  const docs = await Transaction.find(match)
    .select({ date: 1, voucherNo: 1, description: 1, debit: 1, credit: 1, meta: 1 })
    .sort({ date: 1, _id: 1 })
    .limit(limit)
    .lean<TxLean[]>()

  // Normalize for UI (string _id, ensure meta is object) — no `any`
  const rows: RowOut[] = docs.map((d) => ({
    _id: d._id.toString(),
    date: d.date,
    voucherNo: d.voucherNo ?? '',
    description: d.description ?? '',
    debit: Number(d.debit ?? 0),
    credit: Number(d.credit ?? 0),
    meta: d.meta && typeof d.meta === 'object' ? d.meta : {},
  }))

  const totals = rows.reduce(
    (acc, r) => {
      acc.debit += Number(r.debit || 0)
      acc.credit += Number(r.credit || 0)
      return acc
    },
    { debit: 0, credit: 0 }
  )

  return NextResponse.json({ rows, totals })
}
