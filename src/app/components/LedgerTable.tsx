'use client'

import React from 'react'
import dayjs from 'dayjs'

export type Column = { key: string; label: string; align?: 'left' | 'right' | 'center' }
type Period = 'day' | 'month'

type Row = {
  _id?: string
  date: string | Date
  voucherNo?: string
  description?: string
  debit?: number
  credit?: number
  runningBalance: number
  meta?: Record<string, unknown>
}

type Tot = { key: string; debit: number; credit: number; closing: number }

type Props = {
  columns: Column[]
  rows: Row[]
  totals: Tot[]
  period: Period // 'day' or 'month'
  onDelete?: (id: string) => void | Promise<void> // NEW: show actions column when provided
}

/** safe getter for "meta.foo.bar" */
function getMeta(meta: Record<string, unknown> | undefined, path: string): unknown {
  if (!meta) return undefined
  const parts = path.split('.')
  let cur: unknown = meta
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else {
      return undefined
    }
  }
  return cur
}

export default function LedgerTable({ columns, rows, totals, period, onDelete }: Props) {
  const totalsByKey = React.useMemo(() => {
    const m = new Map<string, Tot>()
    for (const t of totals) m.set(t.key, t)
    return m
  }, [totals])

  // Fixed widths so print/export are clean and no columns get cramped
  const colPlan = React.useMemo(
    () =>
      columns.map((c) => {
        let width: string
        if (c.key === 'date') width = '110px'
        else if (c.key === 'voucherNo') width = '120px'
        else if (c.key === 'debit' || c.key === 'credit' || c.key === 'runningBalance') width = '130px'
        else if (c.key === 'description') width = 'auto'
        else width = '160px'
        return { key: c.key, width }
      }),
    [columns]
  )

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-soft print-plain">
      <table className="min-w-full text-sm table-fixed">
        <colgroup>
          {colPlan.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
          {/* Actions column width (screen only) */}
          {onDelete ? <col style={{ width: '84px' }} /> : null}
        </colgroup>

        <thead className="sticky top-0 bg-white/80 backdrop-blur print-plain">
          <tr className="border-b text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-3 font-medium ${
                  c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {c.label}
              </th>
            ))}
            {onDelete ? <th className="px-3 py-3 text-center no-print font-medium">Actions</th> : null}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, idx) => {
            const thisKey = period === 'day' ? dayjs(r.date).format('YYYY-MM-DD') : dayjs(r.date).format('YYYY-MM')
            const nextKey =
              idx < rows.length - 1
                ? period === 'day'
                  ? dayjs(rows[idx + 1].date).format('YYYY-MM-DD')
                  : dayjs(rows[idx + 1].date).format('YYYY-MM')
                : null

            const isLastOfPeriod = !nextKey || nextKey !== thisKey
            const total = totalsByKey.get(thisKey)

            return (
              <React.Fragment key={r._id ?? `row-${idx}`}>
                <tr className="border-b/50">
                  {columns.map((c) => {
                    let value: unknown

                    if (c.key.startsWith('meta.')) {
                      value = getMeta(r.meta, c.key.slice('meta.'.length))
                    } else if (c.key === 'date') {
                      value = dayjs(r.date).format('DD/MM/YYYY')
                    } else {
                      value = (r as unknown as Record<string, unknown>)[c.key]
                    }

                    const isNumber = typeof value === 'number'
                    const display =
                      value == null
                        ? ''
                        : isNumber
                        ? (value as number).toLocaleString()
                        : String(value)

                    return (
                      <td
                        key={c.key}
                        className={`px-4 py-2 ${
                          c.align === 'right'
                            ? 'text-right whitespace-nowrap'
                            : c.align === 'center'
                            ? 'text-center'
                            : ''
                        }`}
                      >
                        {display}
                      </td>
                    )
                  })}

                  {/* Actions (screen only) */}
                  {onDelete ? (
                    <td className="px-3 py-2 no-print text-center">
                      <button
                        type="button"
                        disabled={!r._id}
                        onClick={() => {
                          if (!r._id) return
                          const ok = window.confirm('Delete this entry? This cannot be undone.')
                          if (ok) void onDelete(r._id)
                        }}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Delete entry"
                      >
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>

                {isLastOfPeriod && (
                  <tr className="bg-slate-50 border-t print-plain">
                    <td className="px-4 py-2 text-xs" colSpan={Math.max(columns.length - 3, 1)}>
                      {period === 'day' ? 'Daily' : 'Monthly'} Total ({thisKey})
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {(total?.debit ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {(total?.credit ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {(total?.closing ?? 0).toLocaleString()}
                    </td>
                    {/* keep cell count aligned when actions column exists */}
                    {onDelete ? <td className="no-print" /> : null}
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
