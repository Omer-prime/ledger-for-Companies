import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { InventoryMovement, isObjectId } from '@/models/InventoryMovement'

const Row = z.object({
  type: z.literal('purchase'),
  date: z.string().min(8),
  partyId: z.string().optional(),
  productId: z.string().refine(isObjectId, 'Invalid productId'),
  rate: z.number().nonnegative(),
  qty: z.number().nonnegative(),
  waste: z.number().nonnegative().optional(),
  // NOTE: zod v4 classic requires the key type too:
  meta: z.record(z.string(), z.unknown()).optional(),
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

  const docs: Array<Record<string, unknown>> = []
  for (const r of parsed.data.rows) {
    const base = {
      type: 'purchase' as const,
      date: new Date(r.date),
      partyId: r.partyId,
      productId: r.productId,
      qty: r.qty,
      rate: r.rate,
      meta: r.meta ?? {},
    }
    docs.push(base)

    if (r.waste && r.waste > 0) {
      docs.push({
        type: 'waste' as const,
        date: new Date(r.date),
        partyId: r.partyId,
        productId: r.productId,
        qty: r.waste,
        meta: { reason: 'purchase-row', ...(r.meta ?? {}) },
      })
    }
  }

  const res = await InventoryMovement.insertMany(docs, { ordered: true })
  return NextResponse.json({ inserted: res.length }, { status: 201 })
}
