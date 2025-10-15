import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'

export const dynamic = 'force-dynamic'

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

type PartyRow = { _id: unknown; name: string; code?: string }

export async function GET(req: NextRequest) {
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const limitRaw = Number(searchParams.get('limit') || '10')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10

  const filter: Record<string, unknown> = { type: 'party' }
  if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }

  const docs = await Account.find(filter)
    .select('_id name code')
    .limit(limit)
    .lean<PartyRow[]>()

  const data = docs.map((d) => ({ id: String(d._id), name: d.name, code: d.code ?? '' }))
  return NextResponse.json(data)
}
