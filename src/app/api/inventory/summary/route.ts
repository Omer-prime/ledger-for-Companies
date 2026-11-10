import { apiError, requirePermission, validateQuery, safeApi } from '@/lib/api-security'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import InventoryMovement, { isObjectId } from '@/models/InventoryMovement'
import { computeSummary } from '@/lib/wac'

const Query = z.object({
  productId: z.string().refine(isObjectId, 'Invalid productId'),
})

export const dynamic = 'force-dynamic'

export const GET = safeApi(async function GET(req: Request) {
  const denied = await requirePermission('read')
  if (denied) return denied
  if (!validateQuery(req)) return apiError(400, 'Invalid query')
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const parsed = Query.safeParse({ productId: searchParams.get('productId') })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const movs = await InventoryMovement.find({ productId: parsed.data.productId })
    .select({ type: 1, date: 1, qty: 1, rate: 1, direction: 1 })
    .sort({ date: 1, createdAt: 1, _id: 1 })
    .lean()

  // Map 'opening' to 'purchase' for WAC calculation (same effect: add stock/value)
  const summary = computeSummary(
    movs.map((m) => {
      const base = {
        date: new Date(m.date),
        qty: Number(m.qty || 0),
        direction: m.direction,
        rate: typeof m.rate === 'number' ? m.rate : undefined,
      }
      const type =
        (m.type === 'opening' ? 'purchase' : m.type) as 'purchase' | 'sale' | 'waste' | 'adjustment'
      return { type, ...base }
    })
  )

  return NextResponse.json(
    { qty: summary.qty, value: summary.value, avg: summary.avg },
    { status: 200 },
  )
})
