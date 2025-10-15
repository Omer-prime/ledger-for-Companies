'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import PartyAutocomplete from '../../../components/PartyAutocomplete'

type Row = {
  _id: string
  date: string
  voucherNo?: string
  description?: string
  debit?: number
  credit?: number
  meta?: Record<string, unknown>
}

type Cat = { _id: string; name: string }
type Monthly = { key: string; debit: number; credit: number; net: number }

type Role = 'superadmin' | 'admin' | 'manager' | 'accountant'
type Me = { role: Role } | null

type Totals = { debit: number; credit: number }

const fmtMoney = (n: number): string => Number(n || 0).toLocaleString()

const QUICK_RANGES = [
  { key: 'this_month', label: 'This Month', get: () => ({ from: dayjs().startOf('month'), to: dayjs().endOf('month') }) },
  { key: 'last_month', label: 'Last Month', get: () => {
      const start = dayjs().subtract(1, 'month').startOf('month')
      return { from: start, to: start.endOf('month') }
    } },
  { key: '30d', label: 'Last 30d', get: () => ({ from: dayjs().subtract(30, 'day'), to: dayjs() }) },
  { key: '90d', label: 'Last 90d', get: () => ({ from: dayjs().subtract(90, 'day'), to: dayjs() }) },
  { key: '6mo', label: 'Last 6 mo', get: () => ({ from: dayjs().subtract(5, 'month').startOf('month'), to: dayjs().endOf('month') }) },
  { key: 'ytd', label: 'This Year (YTD)', get: () => ({ from: dayjs().startOf('year'), to: dayjs() }) },
  { key: 'last_year', label: 'Last Year', get: () => {
      const s = dayjs().subtract(1, 'year').startOf('year')
      return { from: s, to: s.endOf('year') }
    } },
] as const

export default function ReportsPage() {
  const [q, setQ] = useState<string>('')
  const [from, setFrom] = useState<string>(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [to, setTo] = useState<string>(dayjs().endOf('month').format('YYYY-MM-DD'))
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals>({ debit: 0, credit: 0 })
  const [loading, setLoading] = useState<boolean>(false)

  // helper: computed total per row
  function rowTotal(r: Row): number {
    const metaVal =
      r.meta && typeof r.meta === 'object'
        ? (r.meta as Record<string, unknown>)['totalDue']
        : undefined
    const mt = Number(metaVal)
    if (Number.isFinite(mt) && mt !== 0) return mt
    return Number(r.debit || 0) + Number(r.credit || 0)
  }

  // auth
  const [me, setMe] = useState<Me>(null)
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' })
        if (r.ok) {
          const j = (await r.json()) as { role?: Role }
          const role = j?.role
          if (role === 'superadmin' || role === 'admin' || role === 'manager' || role === 'accountant') {
            setMe({ role })
          } else {
            setMe(null)
          }
        }
      } catch {
        setMe(null)
      }
    })()
  }, [])
  const isAdmin = me?.role === 'admin' || me?.role === 'superadmin'

  // filters
  const [party, setParty] = useState<{ id?: string; name: string }>({ name: '' })
  const [cats, setCats] = useState<Cat[]>([])
  const [categoryId, setCategoryId] = useState<string>('')

  // edit mode
  const [edit, setEdit] = useState<boolean>(false)
  const [dirty, setDirty] = useState<Record<string, Partial<Row>>>({})

  // add form
  const [add, setAdd] = useState<{
    date: string
    voucherNo?: string
    description: string
    debit?: number
    credit?: number
  }>({
    date: dayjs().format('YYYY-MM-DD'),
    description: '',
  })

  // load categories
  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/categories')
      const j: Cat[] = await r.json()
      setCats(j)
    })()
  }, [])

  const search = useCallback(async () => {
    setLoading(true)
    const qp = new URLSearchParams({
      q,
      from,
      to,
      limit: '2000',
      ...(party.id ? { partyId: party.id } : {}),
      ...(categoryId ? { categoryId } : {}),
    })
    const res = await fetch(`/api/transactions/search?${qp.toString()}`)
    const json: { rows: Row[]; totals: Totals } = await res.json()
    setRows(json.rows)
    setTotals(json.totals)
    setDirty({})
    setLoading(false)
  }, [q, from, to, party.id, categoryId])

  useEffect(() => { void search() }, [search])

  // monthly summary
  const monthly = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>()
    for (const r of rows) {
      const key = dayjs(r.date).format('YYYY-MM')
      const acc = map.get(key) || { debit: 0, credit: 0 }
      acc.debit += Number(r.debit || 0)
      acc.credit += Number(r.credit || 0)
      map.set(key, acc)
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v, net: v.debit - v.credit }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [rows]) as Monthly[]

  // Σ totals for badge (use rowTotal for "Total")
  const duePaidRem = useMemo(() => {
    const due = rows.reduce((s, r) => s + rowTotal(r), 0)
    const paid = Number(totals.credit || 0)
    const rem = due - paid
    return { due, paid, rem }
  }, [rows, totals.credit])

  function onCellChange(id: string, key: keyof Row, val: unknown) {
    setDirty(prev => ({ ...prev, [id]: { ...prev[id], [key]: val as never } }))
    setRows(prev => prev.map(r => (r._id === id ? { ...r, [key]: val as never } : r)))
  }

  async function saveChanges() {
    const ids = Object.keys(dirty)
    if (!ids.length) return
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/transactions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dirty[id]),
        }),
      ),
    )
    await search()
  }

  async function addRow() {
    const body = {
      accountId: party.id,
      categoryId: categoryId || undefined,
      ...add,
    }
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setAdd({
        date: dayjs().format('YYYY-MM-DD'),
        description: '',
        voucherNo: '',
        debit: undefined,
        credit: undefined,
      })
      await search()
    }
  }

  async function deleteRow(id: string) {
    if (!isAdmin) return
    const ok = window.confirm('Delete this transaction? This cannot be undone.')
    if (!ok) return
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setRows(prev => prev.filter(r => r._id !== id))
      await search()
    } else {
      const msg = await res.text().catch(() => '')
      alert(msg || 'Delete failed')
    }
  }

  /* ======================= EXPORT HELPERS ======================= */
  const metaKeys: string[] = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      if (r.meta && typeof r.meta === 'object') {
        for (const k of Object.keys(r.meta)) set.add(k)
      }
    }
    set.delete('categoryId')
    set.delete('totalDue') // shown as dedicated "Total"
    return [...set].sort()
  }, [rows])

  function htmlEscape(v: unknown): string {
    const s = v == null ? '' : String(v)
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function openPrintWindow(html: string) {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.onload = () => w.print()
  }

  function buildCommonStyles(orientation: 'portrait' | 'landscape' = 'portrait'): string {
    return `
      <style>
        @page { size: A4 ${orientation}; margin: 10mm; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Liberation Sans', sans-serif; color:#111827; }
        h1 { font-size: 16px; margin: 0 0 6px 0; }
        h2 { font-size: 13px; margin: 12px 0 6px; }
        .sub { font-size: 11px; color:#4b5563; margin-bottom: 8px; }
        ul { margin: 4px 0 10px 16px; padding: 0; }
        li { font-size: 11px; line-height: 1.35; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; outline: 1px solid #000; table-layout: fixed; }
        th, td { border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 6px 8px; font-size: 11px; line-height: 1.35; vertical-align: top; word-break: break-word; }
        thead th { background: #f3f4f6; font-weight: 700; }
        tr > :first-child { border-left: 0; } tr > :last-child { border-right: 0; }
        thead tr:first-child > * { border-top: 0; } tfoot tr:last-child > * { border-bottom: 0; }
        .num { text-align: right; white-space: nowrap; }
        .right { text-align: right; }
      </style>
    `
  }

  // PDF export — Voucher omitted; "Total" uses rowTotal()
  function exportResultsPDF() {
    const headers = [
      { key: 'date', label: 'Date' },
      // { key: 'voucherNo', label: 'Voucher#' },
      { key: 'description', label: 'Description' },
      { key: 'total', label: 'Total', numeric: true }, // computed
      { key: 'debit', label: 'Debit', numeric: true },
      { key: 'credit', label: 'Credit', numeric: true },
      ...metaKeys.map((k) => ({ key: `meta.${k}`, label: k })),
    ] as Array<{ key: string; label: string; numeric?: boolean }>

    const rowsHtml = rows.map((r) => {
      const cells: string[] = []
      for (const h of headers) {
        let val: unknown = ''
        if (h.key === 'date') {
          val = dayjs(r.date).isValid() ? dayjs(r.date).format('DD/MM/YYYY') : r.date
        } else if (h.key === 'debit') {
          val = Number(r.debit || 0).toLocaleString()
        } else if (h.key === 'credit') {
          val = Number(r.credit || 0).toLocaleString()
        } else if (h.key === 'total') {
          val = rowTotal(r).toLocaleString()
        } else if (h.key.startsWith('meta.')) {
          const mk = h.key.slice(5)
          const metaVal = r.meta && typeof r.meta === 'object' ? (r.meta as Record<string, unknown>)[mk] : undefined
          val = metaVal ?? ''
        } else {
          val = (r as Record<string, unknown>)[h.key] ?? ''
        }
        cells.push(`<td class="${h.numeric ? 'num' : ''}">${htmlEscape(val)}</td>`)
      }
      return `<tr>${cells.join('')}</tr>`
    }).join('')

    const totalIdx = headers.findIndex(h => h.key === 'total')
    const creditIdx = headers.findIndex(h => h.key === 'credit')
    const leadingSpan = Math.max(totalIdx, 0)
    const trailingSpan = Math.max(headers.length - (creditIdx + 1), 0)

    const totalsRow = `
      <tr>
        <td class="right" ${leadingSpan ? `colspan="${leadingSpan}"` : ''}><b>Totals</b></td>
        <td class="num"><b>${rows.reduce((s, r) => s + rowTotal(r), 0).toLocaleString()}</b></td>
        <td class="num"><b>${totals.debit.toLocaleString()}</b></td>
        <td class="num"><b>${totals.credit.toLocaleString()}</b></td>
        ${trailingSpan ? `<td colspan="${trailingSpan}"></td>` : ''}
      </tr>
    `

    const sub = [
      party.name ? `Party: ${htmlEscape(party.name)}` : null,
      `Range: ${from} → ${to}`,
      `Total: ${rows.reduce((s, r) => s + rowTotal(r), 0).toLocaleString()} · Paid: ${totals.credit.toLocaleString()} · Remaining: ${(rows.reduce((s, r) => s + rowTotal(r), 0) - totals.credit).toLocaleString()}`,
    ].filter(Boolean).join(' · ')

    const descLines = rows
      .filter((r) => (r.description || '').trim() !== '')
      .map((r) => `<li>${dayjs(r.date).format('DD/MM/YYYY')} — ${htmlEscape(r.description!)}</li>`)
      .join('')

    const html = `
      <!doctype html><html><head><meta charset="utf-8" />
      <title>Transactions Report</title>
      ${buildCommonStyles('landscape')}
      </head><body>
        <h1>Transactions Report</h1>
        <div class="sub">${sub}</div>

        <h2>Descriptions</h2>
        <ul>${descLines || '<li>No descriptions.</li>'}</ul>

        <table>
          <thead>
            <tr>
              ${headers.map(h => `<th class="${h.numeric ? 'num' : ''}">${htmlEscape(h.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            ${totalsRow}
          </tbody>
        </table>
      </body></html>
    `
    openPrintWindow(html)
  }

  // MONTHLY export (unchanged)
  function exportMonthlyPDF() {
    const rowsHtml = monthly.map((m) => `
      <tr>
        <td>${htmlEscape(m.key)}</td>
        <td class="num">${m.debit.toLocaleString()}</td>
        <td class="num">${m.credit.toLocaleString()}</td>
        <td class="num"><b>${m.net.toLocaleString()}</b></td>
      </tr>
    `).join('')

    const sub = [
      party.name ? `Party: ${htmlEscape(party.name)}` : null,
      `Range: ${from} → ${to}`,
    ].filter(Boolean).join(' · ')

    const html = `
      <!doctype html><html><head><meta charset="utf-8" />
      <title>Monthly Summary</title>
      ${buildCommonStyles('portrait')}
      </head><body>
        <h1>Monthly Summary</h1>
        <div class="sub">${sub}</div>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th class="num">Debit</th>
              <th class="num">Credit</th>
              <th class="num">Net</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body></html>
    `
    openPrintWindow(html)
  }

  function applyRange(key: typeof QUICK_RANGES[number]['key']): void {
    const r = QUICK_RANGES.find((x) => x.key === key)
    if (!r) return
    const d = r.get()
    setFrom(d.from.format('YYYY-MM-DD'))
    setTo(d.to.format('YYYY-MM-DD'))
  }

  return (
    <main className="space-y-5">
      {/* Hero / Totals */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 text-white shadow-soft">
        <div className="relative p-6 md:p-8">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Reports</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/85">
            Filter, edit inline, export statements and monthly summaries.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 p-4">
              <div className="text-xs uppercase tracking-wide text-white/80">Debit</div>
              <div className="text-lg font-semibold">{fmtMoney(totals.debit)}</div>
            </div>
            <div className="rounded-xl bg-white/10 p-4">
              <div className="text-xs uppercase tracking-wide text-white/80">Credit</div>
              <div className="text-lg font-semibold">{fmtMoney(totals.credit)}</div>
            </div>
            <div className="rounded-xl bg-white/10 p-4">
              <div className="text-xs uppercase tracking-wide text-white/80">Net</div>
              <div className="text-lg font-semibold">
                {fmtMoney(totals.debit - totals.credit)}
              </div>
            </div>
          </div>

          {/* Σ badge row */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/10 p-3">
              <div className="text-[11px] uppercase tracking-wide text-white/80">Σ Total</div>
              <div className="text-base font-semibold">{fmtMoney(duePaidRem.due)}</div>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <div className="text-[11px] uppercase tracking-wide text-white/80">Σ Paid (Credit)</div>
              <div className="text-base font-semibold">{fmtMoney(duePaidRem.paid)}</div>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <div className="text-[11px] uppercase tracking-wide text-white/80">Remaining</div>
              <div className="text-base font-semibold">{fmtMoney(duePaidRem.rem)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Filters Card */}
      <section className="no-print rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Filters & Tools</h2>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 md:flex">
              {QUICK_RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => applyRange(r.key)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50"
                  title={`Set ${r.label}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setQ(''); setParty({ name: '' }); setCategoryId(''); applyRange('this_month') }}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
              title="Reset all filters"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <PartyAutocomplete
            value={party.name}
            onChange={(v: { id?: string; name: string }) => setParty({ id: v.id, name: v.name })}
            placeholder="Filter: Party…"
          />
          <select
            className="rounded-xl border px-3 py-2"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">All Categories</option>
            {cats.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Contains text…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <input
            className="rounded-xl border px-3 py-2"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            className="rounded-xl border px-3 py-2"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <button
            onClick={() => void search()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white shadow-soft hover:bg-blue-700 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {Boolean(q || party.id || categoryId) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {party.name && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-blue-800">
                Party: {party.name}
                <button aria-label="Clear party" onClick={() => setParty({ name: '' })}>✕</button>
              </span>
            )}
            {categoryId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                Category
                <button aria-label="Clear category" onClick={() => setCategoryId('')}>✕</button>
              </span>
            )}
            {q && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-3 py-1 text-violet-800">
                Contains: “{q}”
                <button aria-label="Clear text" onClick={() => setQ('')}>✕</button>
              </span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} />
                Enable inline editing
              </label>
              <button
                onClick={() => void saveChanges()}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={!Object.keys(dirty).length}
                title={Object.keys(dirty).length ? 'Save changes' : 'No changes'}
              >
                Save changes
              </button>
              <button
                onClick={exportResultsPDF}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={loading || rows.length === 0}
                title="Download filtered results as PDF (includes description list)"
              >
                Export Results (PDF + Descriptions)
              </button>
              <button
                onClick={exportMonthlyPDF}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={loading || monthly.length === 0}
                title="Download monthly summary as PDF"
              >
                Export Monthly Summary (PDF)
              </button>
            </span>
          </div>
        )}
      </section>

      {/* Monthly summary */}
      <section className="no-print rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Monthly summary</h3>
          <div className="text-sm text-slate-600">
            Overall — Debit: <b>{fmtMoney(totals.debit)}</b> · Credit:{' '}
            <b>{fmtMoney(totals.credit)}</b> · Net:{' '}
            <b>{fmtMoney(totals.debit - totals.credit)}</b>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b">
                <th className="px-3 py-2 text-left">Month</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.key} className="border-b/50">
                  <td className="px-3 py-2">{m.key}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(m.debit)}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(m.credit)}</td>
                  <td className={`px-3 py-2 text-right ${m.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtMoney(m.net)}</td>
                </tr>
              ))}
              {monthly.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    No summary.
                  </td>
                </tr>
              )}
              {loading && (
                <>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <tr key={`mskel-${i}`} className="animate-pulse border-b/50">
                      <td className="px-3 py-2"><span className="inline-block h-3 w-24 rounded bg-slate-200" /></td>
                      <td className="px-3 py-2 text-right"><span className="inline-block h-3 w-16 rounded bg-slate-200" /></td>
                      <td className="px-3 py-2 text-right"><span className="inline-block h-3 w-16 rounded bg-slate-200" /></td>
                      <td className="px-3 py-2 text-right"><span className="inline-block h-3 w-16 rounded bg-slate-200" /></td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Results with computed Total */}
      <section className="no-print rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Results</h3>
          <div className="text-xs text-slate-500">{rows.length} row(s)</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Voucher#</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                {isAdmin && <th className="px-3 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody aria-busy={loading}>
              {!loading && rows.map((r) => (
                <tr key={r._id} className="border-b/50 hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    {edit ? (
                      <input
                        type="date"
                        className="rounded-md border px-2 py-1"
                        value={dayjs(r.date).format('YYYY-MM-DD')}
                        onChange={(e) => onCellChange(r._id, 'date', e.target.value)}
                      />
                    ) : (
                      dayjs(r.date).format('DD/MM/YYYY')
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {edit ? (
                      <input
                        className="rounded-md border px-2 py-1"
                        value={r.voucherNo || ''}
                        onChange={(e) => onCellChange(r._id, 'voucherNo', e.target.value)}
                      />
                    ) : (
                      r.voucherNo || '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {edit ? (
                      <input
                        className="w-full rounded-md border px-2 py-1"
                        value={r.description || ''}
                        onChange={(e) => onCellChange(r._id, 'description', e.target.value)}
                      />
                    ) : (
                      r.description || ''
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {fmtMoney(rowTotal(r))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {edit ? (
                      <input
                        type="number"
                        className="rounded-md border px-2 py-1 text-right"
                        value={r.debit ?? 0}
                        onChange={(e) => onCellChange(r._id, 'debit', Number(e.target.value || 0))}
                      />
                    ) : (
                      fmtMoney(Number(r.debit || 0))
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {edit ? (
                      <input
                        type="number"
                        className="rounded-md border px-2 py-1 text-right"
                        value={r.credit ?? 0}
                        onChange={(e) => onCellChange(r._id, 'credit', Number(e.target.value || 0))}
                      />
                    ) : (
                      fmtMoney(Number(r.credit || 0))
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => void deleteRow(r._id)}
                        className="rounded-lg border border-red-200 px-3 py-1 text-red-600 hover:bg-red-50"
                        title="Delete transaction (admin/superadmin)"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {loading && (
                <>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`skel-${i}`} className="animate-pulse border-b/50">
                      {Array.from({ length: isAdmin ? 7 : 6 }).map((__, j) => (
                        <td key={`cell-${i}-${j}`} className="px-3 py-3">
                          <span className="inline-block h-3 w-full max-w-[140px] rounded bg-slate-200" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-3 py-10 text-center text-slate-500">
                    No results. Try adjusting filters above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
