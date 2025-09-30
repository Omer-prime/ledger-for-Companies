'use client'

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import AccountSelect from './AccountSelect'
import LedgerTable, { type Column } from './LedgerTable'
import ExportButtons from './ExportButtons'
import { toCSV } from '@/utils/csv'

const FACTORY_NAME =
  process.env.NEXT_PUBLIC_FACTORY_NAME || process.env.NEXT_PUBLIC_APP_NAME || 'Factory'

type Period = 'day' | 'month'

type LedgerRow = {
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

type ApiData = {
  opening: number
  rows: LedgerRow[]
  totals: { period: Period; items: Tot[] }
}

export default function LedgerClient() {
  const [accountId, setAccountId] = useState<string>('')
  const [from, setFrom] = useState<string>(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [to, setTo] = useState<string>(dayjs().endOf('month').format('YYYY-MM-DD'))
  const [period, setPeriod] = useState<Period>('day')
  const [title, setTitle] = useState<string>('Ledger Statement') // print heading
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const columns: Column[] = useMemo(
    () => [
      { key: 'date', label: 'Date' },
      { key: 'voucherNo', label: 'Voucher#' },
      { key: 'description', label: 'Description' },
      { key: 'debit', label: 'Debit', align: 'right' },
      { key: 'credit', label: 'Credit', align: 'right' },
      { key: 'runningBalance', label: 'Balance', align: 'right' },
    ],
    []
  )

  async function load() {
    if (!accountId) return
    setLoading(true)
    try {
      const qp = new URLSearchParams({
        accountId,
        from,
        to,
        period,
      })
      const res = await fetch(`/api/transactions?${qp.toString()}`)
      const json: ApiData = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, from, to, period])

  function exportCSV() {
    if (!data) return
    const headers = columns.map((c) => ({ key: c.key as keyof LedgerRow, label: c.label }))
    const csv = toCSV<LedgerRow>(data.rows, headers)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `ledger_${from}_${to}_${period}.csv`
    link.click()
  }

  // quick range helpers
  function setToday() {
    const d = new Date()
    const y = d.toISOString().slice(0, 10)
    setFrom(y)
    setTo(y)
  }
  function setLastNDays(n: number) {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - (n - 1))
    setFrom(start.toISOString().slice(0, 10))
    setTo(end.toISOString().slice(0, 10))
  }
  function setThisMonth() {
    const d = new Date()
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    setFrom(first.toISOString().slice(0, 10))
    setTo(last.toISOString().slice(0, 10))
  }

  // Delete a single transaction and refresh
  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        console.error('Delete failed', await res.text())
        return
      }
      // re-load so running balances + totals recompute correctly
      await load()
    } catch (err) {
      console.error('Delete error', err)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-soft no-print">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <AccountSelect value={accountId} onChange={setAccountId} />
          </div>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border px-3 py-2"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border px-3 py-2"
          />
          <select
            className="rounded-xl border px-3 py-2"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="day">Daily totals</option>
            <option value="month">Monthly totals</option>
          </select>
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Print heading"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* quick presets */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs no-print">
          <button onClick={setToday} className="rounded-lg border px-3 py-1 hover:bg-slate-50">
            Today
          </button>
          <button onClick={() => setLastNDays(7)} className="rounded-lg border px-3 py-1 hover:bg-slate-50">
            Last 7 days
          </button>
          <button onClick={() => setLastNDays(14)} className="rounded-lg border px-3 py-1 hover:bg-slate-50">
            Last 14 days
          </button>
          <button onClick={setThisMonth} className="rounded-lg border px-3 py-1 hover:bg-slate-50">
            This month
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm opacity-70">
            Opening: <b>{(data?.opening ?? 0).toLocaleString()}</b>
          </div>
          <ExportButtons onCSV={exportCSV} />
        </div>
      </div>

      <div aria-busy={loading} className="relative">
        {loading && (
          <div className="absolute inset-0 grid place-items-center rounded-2xl bg-white/60">
            Loading…
          </div>
        )}

        {data && (
          <div className="print-area">
            <div className="only-print print-header">{title}</div>
            <LedgerTable
              columns={columns}
              rows={data.rows}
              totals={data.totals.items}
              period={period}
              onDelete={handleDelete} // 🚀 enable delete buttons
            />
            <div className="only-print print-footer">{FACTORY_NAME}</div>
          </div>
        )}

        {!loading && !data && (
          <div className="rounded-2xl bg-white p-6 text-sm text-slate-600 shadow-soft">
            Select an account and date range to view the ledger.
          </div>
        )}
      </div>
    </section>
  )
}
