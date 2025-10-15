export type MovementType = 'purchase' | 'sale' | 'waste' | 'adjustment'

export interface Movement {
  type: MovementType
  date: Date
  qty: number
  rate?: number
}

export interface Summary { qty: number; value: number; avg: number }

export function computeSummary(movs: Movement[]): Summary {
  const ordered = [...movs].sort((a, b) => a.date.getTime() - b.date.getTime())
  let qty = 0
  let value = 0

  for (const m of ordered) {
    const avg = qty > 0 ? value / qty : 0
    if (m.type === 'purchase') {
      qty += m.qty
      value += (m.rate ?? 0) * m.qty
    } else { // sale, waste, adjustment consume at avg cost
      qty -= m.qty
      value -= avg * m.qty
    }
  }
  const avg = qty > 0 ? value / qty : 0
  return { qty, value, avg }
}
