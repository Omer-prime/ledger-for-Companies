import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
// ⬇⬇ use the default export
import InventoryMovement from '@/models/InventoryMovement'

const Row = z.object({
  date: z.string().min(1),              // 'YYYY-MM-DD'
  productId: z.string().min(1),
  qty: z.number().nonnegative(),
  avgCost: z.number().nonnegative().optional(), // allow blank -> 0
  note: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = z.object({ rows: z.array(Row).min(1) }).parse(body)

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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Invalid payload'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
