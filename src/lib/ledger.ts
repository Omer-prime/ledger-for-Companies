import dayjs from 'dayjs'
import type { ITransaction } from '@/models/Transaction'

export type LedgerRow = ITransaction & { runningBalance: number }

export type LedgerSummary = {
  opening: number
  rows: LedgerRow[]
  totals: {
    period: 'day' | 'month'
    items: Array<{ key: string; debit: number; credit: number; closing: number }>
  }
}

export function computeRunning(
  txs: Pick<ITransaction, 'date' | 'debit' | 'credit' | 'description' | 'voucherNo' | 'meta'>[],
  opening = 0
): LedgerRow[] {
  let bal = opening
  const out: LedgerRow[] = []
  for (const t of txs) {
    const debit = Number(t.debit ?? 0)
    const credit = Number(t.credit ?? 0)
    bal += debit - credit
    out.push({
      // copy known fields explicitly to keep strong typing
      // (other ITransaction properties like account will be provided by callers when needed)
      date: t.date as Date,
      voucherNo: t.voucherNo,
      description: t.description,
      debit: t.debit,
      credit: t.credit,
      meta: t.meta,
      // @ts-expect-error account will exist on full ITransaction objects
      account: undefined,
      runningBalance: bal,
      // createdAt/updatedAt are not needed for runtime math; left undefined
      // @ts-expect-error timestamps not relevant in this context
      createdAt: undefined,
      // @ts-expect-error timestamps not relevant in this context
      updatedAt: undefined,
    })
  }
  return out
}

export function groupTotals(rows: LedgerRow[], period: 'day' | 'month'): LedgerSummary['totals'] {
  const byKey = new Map<string, { debit: number; credit: number; closing: number }>()
  for (const r of rows) {
    const key = period === 'day' ? dayjs(r.date).format('YYYY-MM-DD') : dayjs(r.date).format('YYYY-MM')
    const entry = byKey.get(key) || { debit: 0, credit: 0, closing: 0 }
    entry.debit += Number(r.debit || 0)
    entry.credit += Number(r.credit || 0)
    entry.closing = r.runningBalance
    byKey.set(key, entry)
  }
  const items = [...byKey.entries()].map(([key, v]) => ({ key, ...v }))
  return { period, items }
}
