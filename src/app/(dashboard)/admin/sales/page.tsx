'use client'

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import PartyAutocomplete from '../../../components/PartyAutocomplete'
import ProductAutocomplete from '../../../components/ProductAutocomplete'

type Row = {
  date?: string
  party?: { id?: string; name: string }
  product?: { id?: string; name: string }
  qty?: number
  sellRate?: number
}

type Summary = { qty: number; value: number; avg: number }

const fmt = (n: number | null | undefined) => Number(n || 0).toLocaleString()

export default function SalesPage() {
  const [rows, setRows] = useState<Row[]>([{ date: dayjs().format('YYYY-MM-DD') }])
  const [summ, setSumm] = useState<Record<string, Summary>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function ensureSummary(productId?: string) {
    if (!productId || summ[productId]) return
    try {
      const r = await fetch('/api/inventory/summary?productId=' + productId)
      const j = r.ok ? await r.json() : {}
      const qty = Number(j.qty || 0), value = Number(j.value || 0)
      setSumm(s => ({ ...s, [productId]: { qty, value, avg: qty > 0 ? value / qty : 0 } }))
    } catch {
      setSumm(s => ({ ...s, [productId]: { qty: 0, value: 0, avg: 0 } }))
    }
  }

  function setCell(i: number, patch: Partial<Row>) {
    setRows(prev => {
      const copy = [...prev]
      copy[i] = { ...copy[i], ...patch }
      return copy
    })
  }

  const computed = useMemo(() => {
    const state: Record<string, Summary> = {}
    for (const [pid, s] of Object.entries(summ)) state[pid] = { ...s }
    return rows.map(r => {
      const pid = r.product?.id
      const base = pid ? (state[pid] || { qty: 0, value: 0, avg: 0 }) : { qty: 0, value: 0, avg: 0 }
      const qty = Number(r.qty || 0)
      const price = Number(r.sellRate || 0) * qty
      const cogs = qty * base.avg
      const newQty = base.qty - qty
      const newValue = base.value - cogs
      const newAvg = newQty > 0 ? newValue / newQty : 0
      if (pid) state[pid] = { qty: newQty, value: newValue, avg: newAvg }
      return { revenue: price, cogs, stockAfter: newQty, valueAfter: newValue, avgAfter: newAvg }
    })
  }, [rows, summ])

  async function save() {
    setSaving(true); setMsg(null)
    const payload = rows
      .filter(r => r.party?.id && r.product?.id && r.qty)
      .map((r, idx) => ({
        type: 'sale',
        date: r.date || dayjs().format('YYYY-MM-DD'),
        partyId: r.party!.id,
        productId: r.product!.id,
        qty: Number(r.qty || 0),
        sellRate: Number(r.sellRate || 0),
        meta: {
          revenue: computed[idx]?.revenue || 0,
          cogs: computed[idx]?.cogs || 0,
          stockAfter: computed[idx]?.stockAfter || 0,
          avgCostAfter: computed[idx]?.avgAfter || 0,
        },
      }))
    const r = await fetch('/api/inventory/sales/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: payload }),
    })
    setSaving(false)
    setMsg(r.ok ? 'Saved ✔' : 'Save failed')
  }

  return (
    <main className="space-y-4">
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Sales</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setRows(p => [...p, { date: dayjs().format('YYYY-MM-DD') }])} className="rounded-xl border bg-white px-4 py-2 shadow hover:bg-slate-50">+ Add row</button>
            <button onClick={save} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2 text-white shadow hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
            {msg && <span className="text-sm text-slate-600">{msg}</span>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: 130 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 140 }} />
            </colgroup>
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Party</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Sell Rate</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">COGS (WAC)</th>
                <th className="px-3 py-2 text-right">Stock After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b/50">
                  <td className="px-3 py-2">
                    <input type="date" value={r.date || ''} onChange={(e) => setCell(i, { date: e.target.value })} className="w-full rounded-md border px-2 py-1" />
                  </td>
                  <td className="px-3 py-2">
                    <PartyAutocomplete value={r.party?.name || ''} onChange={(v) => setCell(i, { party: v })} placeholder="Customer…" />
                  </td>
                  <td className="px-3 py-2">
                    <ProductAutocomplete value={r.product?.name || ''} onChange={async (v) => { setCell(i, { product: v }); await ensureSummary(v.id) }} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" value={r.qty ?? ''} onChange={(e) => setCell(i, { qty: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full rounded-md border px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" value={r.sellRate ?? ''} onChange={(e) => setCell(i, { sellRate: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full rounded-md border px-2 py-1 text-right" />
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(computed[i]?.revenue)}</td>
                  <td className="px-3 py-2 text-right">{fmt(computed[i]?.cogs)}</td>
                  <td className="px-3 py-2 text-right">{fmt(computed[i]?.stockAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Sales reduce stock using the current weighted average cost.
        </p>
      </section>
    </main>
  )
}
