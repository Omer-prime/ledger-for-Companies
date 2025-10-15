import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import InventoryMovement, { isObjectId } from '@/models/InventoryMovement'

const Row = z.object({
  type: z.literal('sale'),
  date: z.string().min(8),
  partyId: z.string().optional(),
  productId: z.string().refine(isObjectId, 'Invalid productId'),
  qty: z.number().positive(),
  sellRate: z.number().nonnegative().optional(),
  meta: z.record(z.string(), z.unknown()).optional(), // <-- key + value types
})

const Body = z.object({
  rows: z.array(Row).min(1),
})

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  await dbConnect()
  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const docs = parsed.data.rows.map((r) => ({
    type: 'sale' as const,
    date: new Date(r.date),
    partyId: r.partyId,
    productId: r.productId,
    qty: r.qty,
    sellRate: r.sellRate,
    meta: r.meta ?? {},
  }))

  const res = await InventoryMovement.insertMany(docs, { ordered: true })
  return NextResponse.json({ inserted: res.length }, { status: 201 })
}
