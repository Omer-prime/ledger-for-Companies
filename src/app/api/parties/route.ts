import { apiError, named, readBody, requirePermission, validateQuery } from '@/lib/api-security'
import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'

export const dynamic = 'force-dynamic'

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

type PartyRow = { _id: unknown; name: string; code?: string }

export async function GET(req: NextRequest) {
  const denied = await requirePermission('read')
  if (denied) return denied
  if (!validateQuery(req)) return apiError(400, 'Invalid query')
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const limitRaw = Number(searchParams.get('limit') || '300')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 300

  const filter: Record<string, unknown> = { type: 'party' }
  if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }

  const docs = await Account.find(filter)
    .select('_id name code')
    .limit(limit)
    .lean<PartyRow[]>()

  const data = docs.map((d) => ({ _id: String(d._id), name: d.name, code: d.code ?? '' }))
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
  await dbConnect()
  const body = await readBody(req, named)
  if (!body) return apiError(400, 'Invalid payload')
  const name = body?.name?.trim()
  const code = body?.code?.trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const created = await Account.create({ name, code, type: 'party' })
  return NextResponse.json(
    { _id: String(created._id), name: created.name, code: created.code ?? '' },
    { status: 201 },
  )
}
