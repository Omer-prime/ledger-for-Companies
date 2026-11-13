'use client'

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
dayjs.extend(utc)
import AccountSelect from './AccountSelect'
import LedgerTable, { type Column } from './LedgerTable'
import ExportButtons from './ExportButtons'
import { toCSV } from '@/utils/csv'

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
  closing: number
  timeZone: string
  businessName: string
  rows: LedgerRow[]
  totals: { period: Period; items: Tot[] }
}

export default function LedgerClient({ timeZone }: { timeZone: string }) {
  const businessToday = () => dayjs.utc(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))
  const [accountId, setAccountId] = useState<string>('')
  const [from, setFrom] = useState<string>(businessToday().startOf('month').format('YYYY-MM-DD'))
  const [to, setTo] = useState<string>(businessToday().endOf('month').format('YYYY-MM-DD'))
  const [period, setPeriod] = useState<Period>('day')
  const [title, setTitle] = useState<string>('Ledger Statement') // print heading
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState('')
  const [paper, setPaper] = useState<'A4' | 'A5'>('A4')

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

  useEffect(() => {
    setData(null)
    setError('')
    setLoading(Boolean(accountId))
    if (!accountId) return
    const controller = new AbortController()
    const query = new URLSearchParams({ accountId, from, to, period })
    void fetch('/api/transactions?' + query, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error()
        const result: ApiData = await response.json()
        if (!controller.signal.aborted) setData(result)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Statement could not be loaded. Check the date range and your access.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
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
    const day = businessToday().format('YYYY-MM-DD')
    setFrom(day)
    setTo(day)
  }
  function setLastNDays(n: number) {
    const end = businessToday()
    setFrom(end.subtract(n - 1, 'day').format('YYYY-MM-DD'))
    setTo(end.format('YYYY-MM-DD'))
  }
  function setThisMonth() {
    const day = businessToday()
    setFrom(day.startOf('month').format('YYYY-MM-DD'))
    setTo(day.endOf('month').format('YYYY-MM-DD'))
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

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm opacity-70">
            Opening: <b>{(data?.opening ?? 0).toLocaleString()}</b>
          </div>
          {data && <>
            <p className="text-sm">Closing balance: <b>{data.closing.toLocaleString()}</b></p>
            <label className="text-sm">Print size <select className="rounded-lg border p-1" value={paper} onChange={event => setPaper(event.target.value === 'A5' ? 'A5' : 'A4')}><option>A4</option><option>A5</option></select></label>
            <ExportButtons onCSV={exportCSV} />
          </>}
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
            {paper === 'A5' && <style>{'@media print { @page { size: A5; } }'}</style>}
            <div className="only-print print-header">{title} · {from} to {to}</div>
            <p className="only-print">Opening: {data.opening.toLocaleString()} · Closing: {data.closing.toLocaleString()}</p>
            <LedgerTable
              columns={columns}
              rows={data.rows}
              totals={data.totals.items}
              period={period}
              timeZone={data.timeZone}
            />
            <div className="only-print print-footer">{data.businessName}</div>
          </div>
        )}

        {error && <p role="alert" className="rounded-xl bg-white p-4 text-red-700">{error}</p>}{!loading && !data && !error && (
          <div className="rounded-2xl bg-white p-6 text-sm text-slate-600 shadow-soft">
            Select an account and date range to view the ledger.
          </div>
        )}
      </div>
    </section>
  )
}
