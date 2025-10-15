import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import type { Types } from 'mongoose'

export const dynamic = 'force-dynamic'

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Shape of the lean docs we read from Mongo
type BankLean = {
  _id: Types.ObjectId
  name: string
  code?: string
}

export async function GET(req: NextRequest) {
  await dbConnect()

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const limitRaw = Number(searchParams.get('limit') || '10')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10

  const filter: Record<string, unknown> = { type: 'bank' }
  if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }

  const docs = await Account.find(filter)
    .select('_id name code')
    .limit(limit)
    .lean<BankLean[]>()

  const data = docs.map(d => ({
    id: d._id.toString(),
    name: d.name,
    code: d.code ?? '',
  }))

  return NextResponse.json(data)
}
