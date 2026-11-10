import { amount, apiError, dateOnly, id, readBody, requirePermission } from '@/lib/api-security'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
// ⬇⬇ use the default export
import InventoryMovement from '@/models/InventoryMovement'

const Row = z.strictObject({
  date: dateOnly,              // 'YYYY-MM-DD'
  productId: id,
  qty: amount,
  avgCost: amount.optional(), // allow blank -> 0
  note: z.string().max(500).optional(),
})

export async function POST(req: Request) {
  const denied = await requirePermission('inventoryPost', req)
  if (denied) return denied
  try {
    const parsed = await readBody(req, z.strictObject({ rows: z.array(Row).min(1).max(500) }))
    if (!parsed) return apiError(400, 'Invalid inventory payload')

    await dbConnect()

    const docs = parsed.rows.map(r => {
      const avg = r.avgCost ?? 0
      return {
        type: 'opening' as const,
        date: new Date(r.date),
        productId: r.productId,
        qty: r.qty,
        rate: avg,
        meta: {
          value: r.qty * avg,
          avgCost: avg,
          note: r.note ?? '',
        },
      }
    })

    const result = await InventoryMovement.insertMany(docs, { ordered: true })
    return NextResponse.json({ inserted: result.length })
  } catch {
    return apiError(500, 'Unable to save opening stock')
  }
}
