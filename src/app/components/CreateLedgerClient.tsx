'use client'

import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import PartyAutocomplete, { type PartyOption } from './PartyAutocomplete'

const FACTORY_NAME =
  process.env.NEXT_PUBLIC_FACTORY_NAME ||
  process.env.NEXT_PUBLIC_APP_NAME ||
  'Factory'

type Cat = { _id: string; name: string; slug: string }
type ColumnType = 'text' | 'number' | 'date'
type Column = { key: string; label: string; type: ColumnType }
type Cell = string | number | Date | null
type Row = Record<string, Cell>

type Product = {
  _id: string
  name: string
  code: string
  price: number | null
  unit: string
}

const CORE_KEYS = new Set(['voucherNo', 'date', 'description', 'debit', 'credit'])

/* ------------ tiny product autocomplete ------------- */
function ProductAutocomplete({
  value,
  onSelect,
  placeholder,
}: {
  value: string
  onSelect: (p: Product) => void
  placeholder?: string
}) {
  const [q, setQ] = useState(value)
  const [list, setList] = useState<Product[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => { setQ(value) }, [value])

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()
    const run = async () => {
      const url = q ? `/api/products?q=${encodeURIComponent(q)}` : `/api/products?limit=50`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return
      const data = (await res.json()) as Product[]
      if (!ignore) setList(data)
    }
    void run()
    return () => { ignore = true; controller.abort() }
  }, [q])

  return (
    <div className="relative">
      <input
        className="w-full rounded-md border px-2 py-1"
        value={q}
        placeholder={placeholder ?? 'Search product (name/code)…'}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && list.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {list.map((p) => (
            <button
              key={p._id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(p)
                setQ(`${p.name}${p.code ? ` (${p.code})` : ''}`)
                setOpen(false)
              }}
              className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            >
              <div className="text-sm">{p.name}</div>
              <div className="text-xs opacity-60">
                {p.code || '—'} {p.price != null ? ` • ${p.price} / ${p.unit || 'unit'}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* =============================== MAIN =============================== */
export default function CreateLedgerClient() {
  const [cats, setCats] = useState<Cat[]>([])
  const [catId, setCatId] = useState<string>('')

  const selectedCat = useMemo(
    () => cats.find((c) => c._id === catId) || null,
    [cats, catId],
  )
  const isPartyLedger = selectedCat
    ? /party/i.test(selectedCat.name) || /party/i.test(selectedCat.slug)
    : false
  const isProductLedger = selectedCat
    ? /product/i.test(selectedCat.name) || /product/i.test(selectedCat.slug)
    : false

  // only auto-inject product columns ONCE per category selection (so user can delete later)
  const [injectedFor, setInjectedFor] = useState<string | null>(null)

  const [title, setTitle] = useState<string>('Ledger')
  useEffect(() => {
    if (selectedCat) setTitle(`${selectedCat.name} — Ledger`)
  }, [selectedCat])

  // refresh PartyAutocomplete when Parties update elsewhere (optional bus)
  const [partyReloadKey, setPartyReloadKey] = useState<number>(0)
  useEffect(() => {
    const onUpdated = () => setPartyReloadKey((k) => k + 1)
    window.addEventListener('party:list-updated', onUpdated)
    return () => window.removeEventListener('party:list-updated', onUpdated)
  }, [])

  const [columns, setColumns] = useState<Column[]>([
    { key: 'voucherNo', label: 'Voucher / Code', type: 'text' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'debit', label: 'Debit', type: 'number' },
    { key: 'credit', label: 'Credit', type: 'number' },
  ])

  // inject product columns once per product-ledger category
  useEffect(() => {
    if (!isProductLedger || !catId) return
    if (injectedFor === catId) return
    setColumns((prev) => {
      const have = new Set(prev.map((c) => c.key))
      const base: Column[] = []
      for (const k of ['voucherNo', 'date']) {
        const exist = prev.find((c) => c.key === k)!
        base.push(exist)
      }
      if (!have.has('product')) base.push({ key: 'product', label: 'Product', type: 'text' })
      if (!have.has('qty')) base.push({ key: 'qty', label: 'Qty', type: 'number' })
      if (!have.has('rate')) base.push({ key: 'rate', label: 'Rate', type: 'number' })
      if (!have.has('total')) base.push({ key: 'total', label: 'Total', type: 'number' })
      const desc = prev.find((c) => c.key === 'description'); if (desc) base.push(desc)
      // keep any other custom columns and then debit/credit to the right
      for (const c of prev) {
        if (!['voucherNo','date','product','qty','rate','total','description','debit','credit'].includes(c.key)) {
          base.push(c)
        }
      }
      const d = prev.find((c) => c.key === 'debit'); if (d) base.push(d)
      const cr = prev.find((c) => c.key === 'credit'); if (cr) base.push(cr)
      return base
    })
    setInjectedFor(catId)
  }, [isProductLedger, catId, injectedFor])

  const [rows, setRows] = useState<Row[]>(
    () => Array.from({ length: 10 }, () => ({} as Row)),
  )
  const [includeDebit, setIncludeDebit] = useState<boolean>(true)
  const [includeCredit, setIncludeCredit] = useState<boolean>(true)

  const [addCount, setAddCount] = useState<number>(1)
  const [newType, setNewType] = useState<ColumnType>('text')

  const [saving, setSaving] = useState<boolean>(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((data: Cat[]) => setCats(data))
  }, [])

  // Always keep Date column
  useEffect(() => {
    if (!columns.find((c) => c.key === 'date')) {
      setColumns((prev) => [{ key: 'date', label: 'Date', type: 'date' }, ...prev])
    }
  }, [columns])

  // Toggle debit/credit (keeps them to the right)
  useEffect(() => {
    setColumns((prev) => {
      const withoutDC = prev.filter((c) => c.key !== 'debit' && c.key !== 'credit')
      const head = withoutDC.filter((c) =>
        ['voucherNo','date','product','qty','rate','total','description'].includes(c.key),
      )
      const rest = withoutDC.filter(
        (c) => !['voucherNo','date','product','qty','rate','total','description'].includes(c.key),
      )
      if (includeDebit) rest.push({ key: 'debit', label: 'Debit', type: 'number' })
      if (includeCredit) rest.push({ key: 'credit', label: 'Credit', type: 'number' })
      return [...head, ...rest]
    })
  }, [includeDebit, includeCredit])

  function addExtraColumns(n: number, type: ColumnType): void {
    if (!n || n < 1) return
    setColumns((prev) => {
      const extras: Column[] = Array.from({ length: n }, (_, i) => ({
        key: `meta_${Date.now()}_${i}`,
        label: '',
        type,
      }))
      return [...prev, ...extras]
    })
    setAddCount(1)
  }

  function removeColumn(key: string): void {
    // Date is required; prevent removal
    if (key === 'date') return
    if (key === 'debit') setIncludeDebit(false)
    if (key === 'credit') setIncludeCredit(false)

    setColumns((prev) => prev.filter((c) => c.key !== key))
    // remove key from each row
    setRows((prev) =>
      prev.map((r) => {
        const clone: Row = { ...r }
        delete (clone as Record<string, Cell>)[key]
        return clone
      }),
    )
  }

  function changeColumnType(key: string, type: ColumnType): void {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, type } : c)))
  }

  function addRows(n: number): void {
    setRows((prev) => [...prev, ...Array.from({ length: n }, () => ({} as Row))])
  }

  function removeRow(idx: number): void {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  function duplicateRow(idx: number): void {
    setRows((prev) => {
      const copy = [...prev]
      const clone = { ...(copy[idx] || {}) }
      copy.splice(idx + 1, 0, clone)
      return copy
    })
  }

  function clearRow(idx: number): void {
    setRows((prev) => {
      const copy = [...prev]
      copy[idx] = {}
      return copy
    })
  }

  function setCell(rIdx: number, key: string, value: Cell): void {
    setRows((prev) => {
      const copy = [...prev]
      const row: Row = { ...copy[rIdx] }
      row[key] = value
      copy[rIdx] = row
      return copy
    })
  }

  // product helpers: compute total; prefill debit if empty
  function recomputeProductDerived(
    rIdx: number,
    patch?: Partial<Record<string, Cell>>,
  ): void {
    setRows((prev) => {
      const next = [...prev]
      const row: Row = { ...next[rIdx] }
      if (patch) {
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined) row[k] = v as Cell
        }
      }
      const qty = Number(row['qty'] ?? 0) || 0
      const rate = Number(row['rate'] ?? 0) || 0
      const total = qty * rate
      row['total'] = total
      const debit = Number(row['debit'] ?? 0) || 0
      if (!debit && total) row['debit'] = total
      next[rIdx] = row
      return next
    })
  }

  // totals + running balance
  const math = useMemo(() => {
    const totals = { debit: 0, credit: 0 }
    const withBalance: Array<Row & { runningBalance: number }> = []
    let balance = 0
    for (const r of rows) {
      const drow: Row = { ...r }
      if (isProductLedger) {
        const qty = Number(r['qty'] ?? 0) || 0
        const rate = Number(r['rate'] ?? 0) || 0
        const t = qty * rate
        drow['total'] = t
        if (!(Number(drow['debit'] ?? 0) || 0) && t) drow['debit'] = t
      }
      const d = Number(drow['debit'] ?? 0) || 0
      const c = Number(drow['credit'] ?? 0) || 0
      totals.debit += d
      totals.credit += c
      balance += d - c
      withBalance.push({ ...drow, runningBalance: balance })
    }
    return { totals, withBalance }
  }, [rows, isProductLedger])

  // screen col widths
  const colPlan = useMemo(
    () =>
      columns.map((c) => {
        let width: string
        if (c.key === 'date') width = '120px'
        else if (c.key === 'voucherNo') width = '160px'
        else if (c.key === 'debit' || c.key === 'credit') width = '140px'
        else if (c.key === 'description') width = '260px'
        else if (c.key === 'product') width = '220px'
        else if (c.key === 'qty' || c.key === 'rate' || c.key === 'total')
          width = '120px'
        else if (c.type === 'number') width = '140px'
        else width = '180px'
        return { key: c.key, width }
      }),
    [columns],
  )

  // helpers for the print-only table
  function formatCell(c: Column, value: Cell): string {
    if (value == null || value === '') return ''
    if (c.type === 'date') {
      const dv = value as string | number | Date
      return dayjs(dv).isValid() ? dayjs(dv).format('DD/MM/YYYY') : ''
    }
    if (c.type === 'number') return Number(value || 0).toLocaleString()
    return String(value)
  }

  async function save(): Promise<void> {
    const customCols = columns.filter((c) => !CORE_KEYS.has(c.key))
    const payload = rows.map((r) => {
      const meta: Record<string, unknown> = {}
      for (const col of customCols) {
        const v = r[col.key]
        if (v !== null && v !== '' && v !== undefined) meta[col.key] = v
      }
      return {
        voucherNo: (r['voucherNo'] as string) || '',
        date: r['date']
          ? dayjs(r['date'] as string | number | Date).format('YYYY-MM-DD')
          : undefined,
        description: (r['description'] as string) || '',
        debit: r['debit'] ? Number(r['debit']) : 0,
        credit: r['credit'] ? Number(r['credit']) : 0,
        partyId: (r['partyId'] as string) || null,
        meta,
      }
    })

    setSaving(true)
    setSaveMsg(null)
    const res = await fetch('/api/transactions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: catId || undefined, rows: payload }),
    })
    setSaving(false)
    const json = await res.json().catch(() => ({} as { inserted?: number }))
    setSaveMsg(res.ok ? `Saved ${json.inserted || 0} entries` : 'Save failed')
  }

  // sticky / 3D helpers
  const headerCellBase =
    'bg-white md:bg-gradient-to-b md:from-white md:to-slate-50 md:shadow-[inset_0_-1px_0_rgb(0_0_0_/_0.06)]'

  // for keyboard: tabbing past the last editable cell adds a new row
  function onMaybeAddRow(e: React.KeyboardEvent<HTMLInputElement>, rIdx: number, cIdx: number) {
    if (e.key !== 'Tab' || e.shiftKey) return
    const lastEditable = columns.length - 1 // balance is extra col, not in columns
    if (rIdx === rows.length - 1 && cIdx === lastEditable - 1) {
      setTimeout(() => addRows(1), 0)
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls (glass + 3D) */}
      <div className="no-print rounded-2xl bg-white/80 p-4 shadow-xl ring-1 ring-slate-100 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
            value={catId}
            onChange={(e) => { setCatId(e.target.value); setInjectedFor(null) }}
          >
            <option value="">Select ledger category</option>
            {cats.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-3 rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeDebit}
                onChange={(e) => setIncludeDebit(e.target.checked)}
              />
              Include Debit
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeCredit}
                onChange={(e) => setIncludeCredit(e.target.checked)}
              />
              Include Credit
            </label>
          </div>

          <input
            className="rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
            placeholder={`Print heading (e.g., ${isProductLedger ? 'Product' : 'Mehrban Textile'} — Ledger)`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Add custom columns */}
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="self-center text-xs opacity-70">
            Tip: Rename headers. Add custom columns (Text/Number/Date). Date column is required.
          </div>
          <select
            className="rounded-xl border px-3 py-2"
            value={newType}
            onChange={(e) => setNewType(e.target.value as ColumnType)}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
          </select>
          <input
            type="number"
            min={1}
            max={10}
            className="w-24 rounded-xl border px-3 py-2"
            value={addCount}
            onChange={(e) =>
              setAddCount(Math.max(1, Math.min(10, Number(e.target.value || 1))))
            }
          />
          <button
            type="button"
            onClick={() => addExtraColumns(addCount, newType)}
            className="rounded-xl border px-4 py-2 shadow active:translate-y-[1px] hover:bg-slate-50"
          >
            + Add Column(s)
          </button>
        </div>

        {saveMsg && <div className="mt-2 text-sm text-blue-700">{saveMsg}</div>}
      </div>

      {/* ======================= SHEET WRAPPER ======================= */}
      <div className="relative overflow-x-auto rounded-2xl bg-white shadow-xl ring-1 ring-slate-100 print-area">
        {/* mobile hint */}
        <div className="no-print md:hidden sticky top-0 z-20 bg-gradient-to-r from-blue-50 to-white px-3 py-2 text-center text-xs text-slate-600">
          Tip: you can scroll this table sideways →
        </div>

        {/* Print heading */}
        <div className="only-print print-header">{FACTORY_NAME}</div>

        {/* ---------- SCREEN TABLE (editable) ---------- */}
        <div className="no-print">
          <table className="w-full table-fixed text-sm">
            {/* +1 col for row tools */}
            <colgroup>
              <col style={{ width: '56px' }} />
              {colPlan.map((c) => (<col key={c.key} style={{ width: c.width }} />))}
              <col style={{ width: '140px' }} />
            </colgroup>

            <thead className="sticky top-0 z-10">
              <tr className="border-b">
                {/* Row tools header */}
                <th className={`${headerCellBase} md:sticky md:left-0 z-10 px-2 py-2 text-left`}>
                  #
                </th>

                {columns.map((c, i) => {
                  const canDelete = c.key !== 'date'
                  // sticky positions for first 2 data cols on md+
                  const stickyClass =
                    c.key === 'voucherNo'
                      ? 'md:sticky md:left-14 z-10'
                      : c.key === 'date'
                      ? 'md:sticky md:left-[216px] z-10'
                      : ''
                  return (
                    <th key={c.key} className={`${headerCellBase} ${stickyClass} px-3 py-2 text-left align-bottom`}>
                      <div className="flex items-center gap-2">
                        <input
                          className="w-full rounded-md border px-2 py-1 text-sm"
                          value={c.label}
                          placeholder="Header"
                          title="Column header"
                          onChange={(e) => {
                            const v = e.target.value
                            setColumns((prev) =>
                              prev.map((col, idx) =>
                                idx === i ? { ...col, label: v } : col,
                              ),
                            )
                          }}
                        />
                        {c.key.startsWith('meta_') && (
                          <select
                            className="rounded-md border px-2 py-1 text-xs"
                            value={c.type}
                            onChange={(e) => changeColumnType(c.key, e.target.value as ColumnType)}
                            aria-label="Column type"
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (!canDelete) return
                            const ok = window.confirm(`Delete column “${c.label || c.key}”?`)
                            if (ok) removeColumn(c.key)
                          }}
                          disabled={!canDelete}
                          className={[
                            'rounded-md border px-2 py-1 text-xs',
                            canDelete
                              ? 'hover:bg-red-50 text-red-600 border-red-200'
                              : 'opacity-40 cursor-not-allowed',
                          ].join(' ')}
                          title={canDelete ? 'Delete column' : 'Date is required'}
                          aria-label={canDelete ? 'Delete column' : 'Date is required'}
                        >
                          🗑
                        </button>
                      </div>
                    </th>
                  )
                })}
                <th className={`${headerCellBase} px-3 py-2 text-right`}>Balance</th>
              </tr>
            </thead>

            <tbody>
              {math.withBalance.map((r, rIdx) => (
                <tr key={rIdx} className="border-b/50 hover:bg-slate-50/60">
                  {/* Row tools (sticky) */}
                  <td className="md:sticky md:left-0 z-10 bg-white px-2 py-2">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border text-[11px] text-slate-600">
                        {rIdx + 1}
                      </span>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => duplicateRow(rIdx)}
                          className="rounded-md border px-1 text-[10px] hover:bg-slate-50"
                          title="Duplicate row"
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          onClick={() => clearRow(rIdx)}
                          className="mt-1 rounded-md border px-1 text-[10px] hover:bg-slate-50"
                          title="Clear row"
                        >
                          🧹
                        </button>
                      </div>
                    </div>
                  </td>

                  {columns.map((c, cIdx) => {
                    // sticky cells to match header (voucherNo & date)
                    const stickyCell =
                      c.key === 'voucherNo'
                        ? 'md:sticky md:left-14 bg-white z-10'
                        : c.key === 'date'
                        ? 'md:sticky md:left-[216px] bg-white z-10'
                        : ''
                    const baseTd = c.type === 'number' ? 'px-3 py-2 text-right' : 'px-3 py-2'
                    const className = `${baseTd} ${stickyCell}`

                    const commonKeyHandler = (e: React.KeyboardEvent<HTMLInputElement>) =>
                      onMaybeAddRow(e, rIdx, cIdx)

                    return (
                      <td key={c.key} className={className}>
                        {isPartyLedger && c.key === 'description' ? (
                          <PartyAutocomplete
                            key={partyReloadKey}
                            value={(r[c.key] as string) || ''}
                            onChange={(v: PartyOption) => {
                              setRows((prev) => {
                                const copy = [...prev]
                                const row: Row = { ...copy[rIdx] }
                                row['description'] = v.name
                                row['partyId'] = v.id ?? null
                                if (!row['voucherNo'] && v.code) row['voucherNo'] = v.code
                                copy[rIdx] = row
                                return copy
                              })
                            }}
                            placeholder="Search party…"
                          />
                        ) : isProductLedger && c.key === 'product' ? (
                          <ProductAutocomplete
                            value={(r['product'] as string) || ''}
                            onSelect={(p) => {
                              setRows((prev) => {
                                const copy = [...prev]
                                const row: Row = { ...copy[rIdx] }
                                row['product'] = p.name
                                if (!row['voucherNo'] && p.code) row['voucherNo'] = p.code
                                if (p.price != null) row['rate'] = p.price
                                copy[rIdx] = row
                                return copy
                              })
                              recomputeProductDerived(rIdx)
                            }}
                          />
                        ) : c.type === 'date' ? (
                          <input
                            type="date"
                            className="w-full rounded-md border px-2 py-1"
                            value={
                              r[c.key]
                                ? dayjs(r[c.key] as string | number | Date).format('YYYY-MM-DD')
                                : ''
                            }
                            onChange={(e) => setCell(rIdx, c.key, e.target.value)}
                            onKeyDown={commonKeyHandler}
                            required={c.key === 'date'}
                          />
                        ) : isProductLedger && (c.key === 'qty' || c.key === 'rate') ? (
                          <input
                            type="number"
                            className="w-full rounded-md border px-2 py-1 text-right"
                            value={(r[c.key] as number | null) ?? ''}
                            onChange={(e) =>
                              recomputeProductDerived(rIdx, {
                                [c.key]: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            onKeyDown={commonKeyHandler}
                          />
                        ) : isProductLedger && c.key === 'total' ? (
                          <input
                            readOnly
                            className="w-full cursor-not-allowed rounded-md border bg-slate-50 px-2 py-1 text-right"
                            value={Number(r['total'] ?? 0).toLocaleString()}
                            title="qty × rate"
                          />
                        ) : c.type === 'number' ? (
                          <input
                            type="number"
                            className="w-full rounded-md border px-2 py-1 text-right"
                            value={(r[c.key] as number | null) ?? ''}
                            onChange={(e) =>
                              setCell(
                                rIdx,
                                c.key,
                                e.target.value === '' ? null : Number(e.target.value),
                              )
                            }
                            onKeyDown={commonKeyHandler}
                          />
                        ) : (
                          <input
                            className="w-full rounded-md border px-2 py-1"
                            value={(r[c.key] as string) || ''}
                            onChange={(e) => setCell(rIdx, c.key, e.target.value)}
                            onKeyDown={commonKeyHandler}
                            placeholder={c.key === 'description' ? 'Details…' : ''}
                          />
                        )}
                      </td>
                    )
                  })}

                  <td className="px-3 py-2 text-right font-medium">
                    {(r['runningBalance'] as number ?? 0).toLocaleString()}
                  </td>

                  {/* row delete at far-right (kept simple) */}
                  <td className="hidden" />
                  <td className="hidden" />
                </tr>
              ))}

              {/* Totals (sticky) */}
              <tr className="sticky bottom-0 bg-gradient-to-b from-slate-50 to-white">
                {/* tools col spacer */}
                <td className="px-2 py-2 text-xs">Totals</td>
                {columns.map((c) => {
                  if (c.key === 'debit')
                    return (
                      <td key="t-debit" className="px-3 py-2 text-right font-semibold">
                        {math.totals.debit.toLocaleString()}
                      </td>
                    )
                  if (c.key === 'credit')
                    return (
                      <td key="t-credit" className="px-3 py-2 text-right font-semibold">
                        {math.totals.credit.toLocaleString()}
                      </td>
                    )
                  return <td key={`t-${c.key}`} className="px-3 py-2" />
                })}
                <td className="px-3 py-2 text-right font-semibold">
                  {(math.totals.debit - math.totals.credit).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ---------- PRINT-ONLY TABLE ---------- */}
        <div className="only-print">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={c.type === 'number' ? 'text-right' : 'text-left'}
                  >
                    {c.label || '\u00A0'}
                  </th>
                ))}
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {math.withBalance.map((r, i) => (
                <tr key={`p-${i}`}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={c.type === 'number' ? 'text-right' : ''}
                    >
                      {formatCell(c, r[c.key])}
                    </td>
                  ))}
                  <td className="text-right font-medium">
                    {Number(r['runningBalance'] ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
              {/* Totals row with exact cell count */}
              <tr>
                {columns.map((c, i) => {
                  if (i === 0) return <td key="pt-label" className="text-xs">Totals</td>
                  if (c.key === 'debit')
                    return (
                      <td key="pt-debit" className="text-right font-semibold">
                        {math.totals.debit.toLocaleString()}
                      </td>
                    )
                  if (c.key === 'credit')
                    return (
                      <td key="pt-credit" className="text-right font-semibold">
                        {math.totals.credit.toLocaleString()}
                      </td>
                    )
                  return <td key={`pt-${c.key}`} />
                })}
                <td className="text-right font-semibold">
                  {(math.totals.debit - math.totals.credit).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="print-footer">{FACTORY_NAME}</div>
        </div>
      </div>

      {/* Actions bar */}
      <div className="no-print sticky bottom-2 z-20 flex flex-wrap items-center gap-2">
        <button
          onClick={() => addRows(10)}
          className="rounded-xl border bg-white px-4 py-2 shadow hover:bg-slate-50 active:translate-y-[1px]"
        >
          + Add 10 rows
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-5 py-2 text-white shadow-lg hover:bg-blue-700 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saveMsg && <span className="text-sm text-slate-600">{saveMsg}</span>}
      </div>
    </div>
  )
}
