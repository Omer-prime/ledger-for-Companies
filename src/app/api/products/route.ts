import { amount, apiError, escapeRegex, readBody, requirePermission, text, validateQuery } from '@/lib/api-security'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'

type ProductDoc = {
  _id: unknown
  name: string
  code?: string
  meta?: Record<string, unknown>
}

export async function GET(req: Request) {
  const denied = await requirePermission('read')
  if (denied) return denied
  if (!validateQuery(req)) return apiError(400, 'Invalid query')
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const limitParam = Number(searchParams.get('limit') ?? '300')
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 300) : 300

  const match: Record<string, unknown> = { type: 'product' }
  if (q) match.name = { $regex: escapeRegex(q), $options: 'i' }

  // Cast through unknown to avoid 'any'
  const docs = (await Account.find(match)
    .sort({ name: 1 })
    .limit(limit)
    .lean()) as unknown as ProductDoc[]

  const list = docs.map((d) => {
    const meta = (d.meta ?? {}) as Record<string, unknown>
    const price = typeof meta.price === 'number' ? meta.price : null
    const unit = typeof meta.unit === 'string' ? meta.unit : ''
    return {
      _id: String(d._id),
      name: d.name,
      code: d.code ?? '',
      price,
      unit,
    }
  })

  return NextResponse.json(list)
}

export async function POST(req: Request) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
  await dbConnect()
  const body = await readBody(req, z.strictObject({
    name: text.min(1), code: text.optional(), price: amount.optional(), unit: text.optional(),
  }))
  if (!body) return apiError(400, 'Invalid product payload')

  const name = body.name?.trim()
  const code = body.code?.trim()
  const price = typeof body.price === 'number' ? body.price : undefined
  const unit = body.unit?.trim()

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const created = await Account.create({
    name,
    code,
    type: 'product',
    meta: {
      ...(price !== undefined ? { price } : {}),
      ...(unit ? { unit } : {}),
    },
  })

  return NextResponse.json(
    {
      _id: String(created._id),
      name: created.name,
      code: created.code ?? '',
      price: price ?? null,
      unit: unit ?? '',
    },
    { status: 201 },
  )
}
