import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import InventoryMovement from '@/models/InventoryMovement'
import { Account } from '@/models/Account'
import { computeSummary } from '@/lib/wac'

export const dynamic = 'force-dynamic'

type NameDoc = { _id: unknown; name: string }

export async function GET() {
  await dbConnect()

  // distinct product ids present in movements
  const ids = (await InventoryMovement.distinct('productId')) as unknown as string[]
  if (ids.length === 0) return NextResponse.json([])

  // fetch names from Account (products live here)
  const nameDocs = await Account.find({ _id: { $in: ids }, type: 'product' })
    .select('_id name')
    .lean<NameDoc[]>()

  const nameById = new Map<string, string>(nameDocs.map(d => [String(d._id), d.name]))

  const lines: { productId: string; productName: string; qty: number; value: number }[] = []

  // compute WAC summary per product
  for (const id of ids) {
    const movs = await InventoryMovement
      .find({ productId: id })
      .select({ type: 1, date: 1, qty: 1, rate: 1 })
      .sort({ date: 1, createdAt: 1 })
      .lean()

    if (movs.length === 0) continue

    const summary = computeSummary(
      movs.map(m => ({
        // opening acts like a purchase for WAC math
        type: (m.type === 'opening' ? 'purchase' : m.type) as 'purchase' | 'sale' | 'waste' | 'adjustment',
        date: new Date(m.date),
        qty: Number(m.qty || 0),
        rate: typeof m.rate === 'number' ? m.rate : undefined,
      }))
    )

    lines.push({
      productId: String(id),
      productName: nameById.get(String(id)) ?? 'Unknown',
      qty: summary.qty,
      value: summary.value,
    })
  }

  lines.sort((a, b) => a.productName.localeCompare(b.productName))
  return NextResponse.json(lines)
}
