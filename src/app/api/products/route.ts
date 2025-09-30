import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'

type ProductBody = {
  name?: string
  code?: string // SKU/Code
  price?: number
  unit?: string
}

type ProductDoc = {
  _id: unknown
  name: string
  code?: string
  meta?: Record<string, unknown>
}

export async function GET(req: Request) {
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const limitParam = Number(searchParams.get('limit') ?? '300')
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 300) : 300

  const match: Record<string, unknown> = { type: 'product' }
  if (q) match.name = { $regex: q, $options: 'i' }

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
  await dbConnect()
  let body: ProductBody
  try {
    body = (await req.json()) as ProductBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

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
