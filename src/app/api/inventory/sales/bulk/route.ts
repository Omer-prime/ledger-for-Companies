import { amount, apiError, dateOnly, id, readBody, requirePermission } from '@/lib/api-security'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import InventoryMovement, { isObjectId } from '@/models/InventoryMovement'

const Row = z.strictObject({
  type: z.literal('sale'),
  date: dateOnly,
  partyId: id.optional(),
  productId: id,
  qty: amount.gt(0),
  sellRate: amount.optional(),
  meta: z.strictObject({ price: amount.optional(), stockAfter: z.number().min(-1e12).max(1e12).optional(), totalValueAfter: amount.optional(), avgCostAfter: amount.optional(), revenue: amount.optional(), cogs: amount.optional() }).optional(),
})

const Body = z.strictObject({
  rows: z.array(Row).min(1).max(500),
})

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const denied = await requirePermission('inventoryPost', req)
  if (denied) return denied
  await dbConnect()
  const rows = await readBody(req, Body)
  if (!rows) return apiError(400, 'Invalid inventory payload')

  const docs = rows.rows.map((r) => ({
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
