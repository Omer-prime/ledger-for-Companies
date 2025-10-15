'use client'

import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import PartyAutocomplete, { type PartyOption } from '../../../components/PartyAutocomplete'
import ProductAutocomplete, { type ProductOption } from '../../../components/ProductAutocomplete'

type Row = {
  date?: string
  party?: PartyOption
  product?: ProductOption
  rate?: number
  qty?: number
  waste?: number
}

type Summary = { qty: number; value: number; avg: number }
type ProductSummaries = Record<string, Summary>

const fmt = (n: number | null | undefined) => Number(n || 0).toLocaleString()

type OpeningModalState = {
  open: boolean
  rowIdx: number | null
  product: ProductOption | null
  date: string
  qty: string
  avg: string
  saving: boolean
  error: string | null
}

export default function PurchasesPage() {
  const [rows, setRows] = useState<Row[]>(
    Array.from({ length: 10 }, () => ({ date: dayjs().format('YYYY-MM-DD') })),
  )
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // server-side starting stock/value for each product (WAC)
  const [summ, setSumm] = useState<ProductSummaries>({})

  // Opening Stock modal
  const [opening, setOpening] = useState<OpeningModalState>({
    open: false,
    rowIdx: null,
    product: null,
    date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    qty: '',
    avg: '',
    saving: false,
    error: null,
  })

  async function ensureSummary(productId?: string, force = false): Promise<void> {
    if (!productId) return
    if (!force && summ[productId]) return
    try {
      const r = await fetch('/api/inventory/summary?productId=' + encodeURIComponent(productId))
      if (r.ok) {
        const j = (await r.json()) as { qty?: number; value?: number }
        const qty = Number(j.qty || 0)
        const value = Number(j.value || 0)
        setSumm(s => ({ ...s, [productId]: { qty, value, avg: qty > 0 ? value / qty : 0 } }))
      } else {
        setSumm(s => ({ ...s, [productId]: { qty: 0, value: 0, avg: 0 } }))
      }
    } catch {
      setSumm(s => ({ ...s, [productId]: { qty: 0, value: 0, avg: 0 } }))
    }
  }

  function setCell(rIdx: number, patch: Partial<Row>): void {
    setRows(prev => {
      const copy = [...prev]
      copy[rIdx] = { ...copy[rIdx], ...patch }
      return copy
    })
  }

  function addRows(n: number): void {
    setRows(prev => [
      ...prev,
      ...Array.from({ length: n }, () => ({ date: dayjs().format('YYYY-MM-DD') })),
    ])
  }

  // running WAC per product across visible rows
  const computed = useMemo(() => {
    const state: Record<string, { qty: number; value: number; avg: number }> = {}
    for (const [pid, s] of Object.entries(summ)) state[pid] = { ...s }

    return rows.map((r) => {
      const pid = r.product?.id
      const base = pid ? (state[pid] || { qty: 0, value: 0, avg: 0 }) : { qty: 0, value: 0, avg: 0 }

      const rate = Number(r.rate || 0)
      const qty = Number(r.qty || 0)
      const waste = Number(r.waste || 0)

      const purchaseValue = rate * qty
      const newQty = base.qty + qty - waste
      const newValue = base.value + purchaseValue - waste * base.avg
      const newAvg = newQty > 0 ? newValue / newQty : 0

      if (pid) state[pid] = { qty: newQty, value: newValue, avg: newAvg }

      return {
        price: purchaseValue,
        stock: newQty,
        totalPrice: newValue,
        avgPrice: newAvg,
      }
    })
  }, [rows, summ])

  async function save(): Promise<void> {
    setSaving(true); setMsg(null)
    const payload = rows
      .filter(r => r.product?.id && r.party?.id && (r.qty || r.waste))
      .map((r, idx) => ({
        type: 'purchase' as const,
        date: r.date || dayjs().format('YYYY-MM-DD'),
        partyId: r.party!.id!,
        productId: r.product!.id!,
        rate: Number(r.rate || 0),
        qty: Number(r.qty || 0),
        waste: Number(r.waste || 0),
        meta: {
          price: computed[idx]?.price || 0,
          stockAfter: computed[idx]?.stock || 0,
          totalValueAfter: computed[idx]?.totalPrice || 0,
          avgCostAfter: computed[idx]?.avgPrice || 0,
        },
      }))

    const r = await fetch('/api/inventory/purchases/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: payload }),
    })
    setSaving(false)
    setMsg(r.ok ? 'Saved ✔' : 'Save failed')
  }

  // ---- Opening Stock: UI helpers ----
  function openOpeningForRow(rIdx: number): void {
    const p = rows[rIdx]?.product || null
    setOpening({
      open: true,
      rowIdx: rIdx,
      product: p,
      date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
      qty: '',
      avg: '',
      saving: false,
      error: null,
    })
  }
  function closeOpening(): void { setOpening(o => ({ ...o, open: false })) }

  async function submitOpening(): Promise<void> {
    if (!opening.product?.id) { setOpening(o => ({ ...o, error: 'Pick a product first.' })); return }
    const qtyNum = Number(opening.qty)
    const avgNum = Number(opening.avg)
    if (!Number.isFinite(qtyNum) || qtyNum < 0) { setOpening(o => ({ ...o, error: 'Invalid opening qty.' })); return }
    if (!Number.isFinite(avgNum) || avgNum < 0) { setOpening(o => ({ ...o, error: 'Invalid average cost.' })); return }

    setOpening(o => ({ ...o, saving: true, error: null }))
    const body = {
      rows: [{
        date: opening.date || dayjs().format('YYYY-MM-DD'),
        productId: opening.product.id!,
        qty: qtyNum,
        avgCost: avgNum,
      }],
    }
    const res = await fetch('/api/inventory/opening/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setOpening(o => ({ ...o, saving: false }))
    if (res.ok) {
      await ensureSummary(opening.product.id!, true)
      closeOpening()
      setMsg('Opening stock set ✔')
    } else {
      const t = await res.text().catch(() => '')
      setOpening(o => ({ ...o, error: t || 'Failed to save opening' }))
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="no-print sticky top-2 z-50 flex flex-wrap items-center gap-2">
        <button
          onClick={() => addRows(10)}
          className="rounded-xl border bg-white px-4 py-2 shadow hover:bg-slate-50 active:translate-y-[1px]"
        >
          + Add 10 rows
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-5 py-2 text-white shadow-lg hover:bg-blue-700 active:translate-y-[1px] disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      {/* DESKTOP/LG TABLE */}
      <div className="relative isolate overflow-visible rounded-2xl bg-white shadow-xl ring-1 ring-slate-100 lg:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: '9%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead className="sticky top-0 z-30 bg-white">
            <tr className="border-b">
              {['Date','Party','Product','Rate','Quantity','Loss / Wasted','Stock','Price','Total Price','Average Price']
                .map((h) => (<th key={h} className="bg-white px-3 py-2 text-left">{h}</th>))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: Row, rIdx: number) => {
              const pid = r.product?.id
              const s = pid ? summ[pid] : undefined
              const showOpeningCTA = pid && s && s.qty === 0 && s.value === 0
              return (
                <tr key={rIdx} className="align-top border-b/50 hover:bg-slate-50">
                  {/* Date */}
                  <td className="bg-white px-3 py-2">
                    <input
                      type="date"
                      className="w-full min-w-[110px] rounded-md border px-3 py-2"
                      value={r.date || ''}
                      onChange={(e) => setCell(rIdx, { date: e.target.value })}
                    />
                  </td>

                  {/* Party */}
                  <td className="bg-white px-3 py-2">
                    <div className="ac-scope relative z-[200]">
                      <PartyAutocomplete
                        value={r.party?.name || ''}
                        onChange={(v) => setCell(rIdx, { party: v })}
                        placeholder="Party…"
                      />
                    </div>
                  </td>

                  {/* Product + summary + opening button */}
                  <td className="bg-white px-3 py-2">
                    <div className="ac-scope relative z-[210]">
                      <ProductAutocomplete
                        value={r.product?.name || ''}
                        onChange={async (v) => { setCell(rIdx, { product: v }); await ensureSummary(v.id, true) }}
                        placeholder="Product…"
                      />
                    </div>
                    {pid && s && (
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Stock: <b>{fmt(s.qty)}</b> · Avg: <b>{s.avg ? s.avg.toFixed(2) : '0.00'}</b></span>
                        {showOpeningCTA && (
                          <button
                            type="button"
                            onClick={() => openOpeningForRow(rIdx)}
                            className="rounded border px-2 py-[2px] text-[11px] hover:bg-slate-50"
                            title="Set opening stock"
                          >
                            Set opening
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Rate */}
                  <td className="bg-white px-3 py-2 text-right">
                    <input
                      type="number"
                      className="w-full rounded-md border px-3 py-2 text-right"
                      value={r.rate ?? ''}
                      onChange={(e) => setCell(rIdx, { rate: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                  </td>

                  {/* Qty */}
                  <td className="bg-white px-3 py-2 text-right">
                    <input
                      type="number"
                      className="w-full rounded-md border px-3 py-2 text-right"
                      value={r.qty ?? ''}
                      onChange={(e) => setCell(rIdx, { qty: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                  </td>

                  {/* Waste */}
                  <td className="bg-white px-3 py-2 text-right">
                    <input
                      type="number"
                      className="w-full rounded-md border px-3 py-2 text-right"
                      value={r.waste ?? 0}
                      onChange={(e) => setCell(rIdx, { waste: e.target.value === '' ? 0 : Number(e.target.value) })}
                    />
                  </td>

                  {/* Derived */}
                  <td className="bg-white px-3 py-2 text-right font-medium">{fmt(computed[rIdx]?.stock)}</td>
                  <td className="bg-white px-3 py-2 text-right">{fmt(computed[rIdx]?.price)}</td>
                  <td className="bg-white px-3 py-2 text-right">{fmt(computed[rIdx]?.totalPrice)}</td>
                  <td className="bg-white px-3 py-2 text-right">
                    {computed[rIdx]?.avgPrice ? computed[rIdx].avgPrice.toFixed(2) : '0.00'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE / TABLET (≤ lg) — stacked cards */}
      <div className="space-y-3 lg:hidden">
        {rows.map((r: Row, rIdx: number) => {
          const pid = r.product?.id
          const s = pid ? summ[pid] : undefined
          const showOpeningCTA = pid && s && s.qty === 0 && s.value === 0
          return (
            <div key={`m-${rIdx}`} className="rounded-xl bg-white p-3 shadow ring-1 ring-slate-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Date</label>
                  <input
                    type="date"
                    className="w-full rounded-md border px-3 py-2"
                    value={r.date || ''}
                    onChange={(e) => setCell(rIdx, { date: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-500">Party</label>
                  <div className="ac-scope relative z-40">
                    <PartyAutocomplete
                      value={r.party?.name || ''}
                      onChange={(v) => setCell(rIdx, { party: v })}
                      placeholder="Party…"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-[11px] text-slate-500">Product</label>
                  <div className="ac-scope relative z-50">
                    <ProductAutocomplete
                      value={r.product?.name || ''}
                      onChange={async (v) => { setCell(rIdx, { product: v }); await ensureSummary(v.id, true) }}
                      placeholder="Product…"
                    />
                  </div>
                  {pid && s && (
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Stock: <b>{fmt(s.qty)}</b> · Avg: <b>{s.avg ? s.avg.toFixed(2) : '0.00'}</b></span>
                      {showOpeningCTA && (
                        <button
                          type="button"
                          onClick={() => openOpeningForRow(rIdx)}
                          className="rounded border px-2 py-[2px] text-[11px] hover:bg-slate-50"
                        >
                          Set opening
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Rate</label>
                  <input
                    type="number"
                    className="w-full rounded-md border px-3 py-2 text-right"
                    value={r.rate ?? ''}
                    onChange={(e) => setCell(rIdx, { rate: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Qty</label>
                  <input
                    type="number"
                    className="w-full rounded-md border px-3 py-2 text-right"
                    value={r.qty ?? ''}
                    onChange={(e) => setCell(rIdx, { qty: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Waste</label>
                  <input
                    type="number"
                    className="w-full rounded-md border px-3 py-2 text-right"
                    value={r.waste ?? 0}
                    onChange={(e) => setCell(rIdx, { waste: e.target.value === '' ? 0 : Number(e.target.value) })}
                  />
                </div>

                {/* Derived summary row */}
                <div className="col-span-2 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-2 text-sm">
                  <div><span className="text-[11px] text-slate-500">Stock</span><div className="font-medium">{fmt(computed[rIdx]?.stock)}</div></div>
                  <div><span className="text-[11px] text-slate-500">Price</span><div>{fmt(computed[rIdx]?.price)}</div></div>
                  <div><span className="text-[11px] text-slate-500">Avg</span><div>{computed[rIdx]?.avgPrice ? computed[rIdx].avgPrice.toFixed(2) : '0.00'}</div></div>
                  <div className="col-span-3"><span className="text-[11px] text-slate-500">Total Value</span><div>{fmt(computed[rIdx]?.totalPrice)}</div></div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-500">
        Stock/Value start from server summary for each product (WAC). “Price” = rate×quantity for that row.
        “Stock”, “Total Price”, and “Average Price” show the running values after each row. Use “Set opening”
        to seed stock for products that existed before going digital.
      </p>

      {/* Opening Stock Modal */}
      {opening.open && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Set Opening Stock</h3>
              <button onClick={closeOpening} className="rounded-md border px-2 py-1 text-sm hover:bg-slate-50">
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-600">Product</label>
                <div className="ac-scope relative">
                  <ProductAutocomplete
                    value={opening.product?.name || ''}
                    onChange={(v) => setOpening(o => ({ ...o, product: v }))}
                    placeholder="Product…"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">Date</label>
                  <input
                    type="date"
                    className="w-full rounded-md border px-3 py-2"
                    value={opening.date}
                    onChange={(e) => setOpening(o => ({ ...o, date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">Opening Qty</label>
                  <input
                    type="number"
                    className="w-full rounded-md border px-3 py-2 text-right"
                    value={opening.qty}
                    onChange={(e) => setOpening(o => ({ ...o, qty: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-600">Average Cost</label>
                <input
                  type="number"
                  className="w-full rounded-md border px-3 py-2 text-right"
                  value={opening.avg}
                  onChange={(e) => setOpening(o => ({ ...o, avg: e.target.value }))}
                />
              </div>

              {opening.error && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {opening.error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={closeOpening} className="rounded-xl border bg-white px-4 py-2 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  onClick={submitOpening}
                  disabled={opening.saving}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {opening.saving ? 'Saving…' : 'Save opening'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Force opaque, high-z dropdown menus (works for portaled and inline menus) */}
      <style jsx global>{`
        /* If menus render inline */
        .ac-scope [role="listbox"] {
          background-color: #ffffff !important;
          border: 1px solid rgba(15, 23, 42, 0.08) !important;
          border-radius: 0.5rem !important;
          box-shadow: 0 10px 20px rgba(2, 6, 23, 0.08), 0 2px 6px rgba(2, 6, 23, 0.06) !important;
          z-index: 9999 !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .ac-scope [role="listbox"] [role="option"],
        .ac-scope [role="listbox"] button,
        .ac-scope [role="listbox"] li {
          background-color: #ffffff !important;
        }
        .ac-scope [role="listbox"] [aria-selected="true"],
        .ac-scope [role="listbox"] [data-active] {
          background-color: #f8fafc !important; /* slate-50 */
        }

        /* If menus render via a portal to <body>, target them globally too */
        [role="listbox"] {
          background-color: #ffffff !important;
          border: 1px solid rgba(15, 23, 42, 0.08) !important;
          border-radius: 0.5rem !important;
          box-shadow: 0 10px 20px rgba(2, 6, 23, 0.08), 0 2px 6px rgba(2, 6, 23, 0.06) !important;
          z-index: 9999 !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        [role="listbox"] [role="option"],
        [role="listbox"] button,
        [role="listbox"] li {
          background-color: #ffffff !important;
        }
        [role="listbox"] [aria-selected="true"],
        [role="listbox"] [data-active] {
          background-color: #f8fafc !important;
        }

        /* Helpful to isolate stacking inside the cell wrapper */
        .ac-scope { isolation: isolate; }
      `}</style>
    </div>
  )
}
