import { amount, apiError, dateOnly, id, readBody, requirePermission } from '@/lib/api-security'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { InventoryMovement } from '@/models/InventoryMovement'

const Row = z.strictObject({
  type: z.literal('purchase'),
  date: dateOnly,
  partyId: id.optional(),
  productId: id,
  rate: amount,
  qty: amount.gt(0),
  waste: amount.optional(),
  meta: z.strictObject({ price: amount.optional(), stockAfter: z.number().min(-1e12).max(1e12).optional(), totalValueAfter: amount.optional(), avgCostAfter: amount.optional(), revenue: amount.optional(), cogs: amount.optional() }).optional(),
}).refine(row => (row.waste ?? 0) <= row.qty)

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

  const docs: Array<Record<string, unknown>> = []
  for (const r of rows.rows) {
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
