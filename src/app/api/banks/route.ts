import { apiError, escapeRegex, named, readBody, requirePermission, validateQuery } from '@/lib/api-security'
import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'

export async function GET(req: Request) {
  const denied = await requirePermission('read')
  if (denied) return denied
  if (!validateQuery(req)) return apiError(400, 'Invalid query')
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const match: Record<string, unknown> = { type: 'bank' }
  if (q) match.name = { $regex: escapeRegex(q), $options: 'i' }

  const list = await Account.find(match).sort({ name: 1 }).limit(q ? 50 : 200).lean()
  return NextResponse.json(list)
}

export async function POST(req: Request) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
  await dbConnect()
  const body = await readBody(req, named)
  if (!body) return apiError(400, 'Invalid payload')
  const { name, code } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const created = await Account.create({ name: name.trim(), code: code?.trim(), type: 'bank' })
  return NextResponse.json(created, { status: 201 })
}
