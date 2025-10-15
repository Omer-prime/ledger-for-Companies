'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

type BankOption = { id?: string; name: string; code?: string }

const CORE_KEYS = new Set(['voucherNo', 'date', 'description', 'debit', 'credit'])

/** Very small bank autocomplete (uses <datalist>) expecting /api/banks/search?q=…&limit=10 */
function BankAutocomplete({
  value,
  onChange,
  placeholder = 'Select bank…',
}: {
  value: string
  onChange: (v: BankOption) => void
  placeholder?: string
}) {
  const [q, setQ] = useState(value || '')
  const [opts, setOpts] = useState<BankOption[]>([])

  useEffect(() => {
    if (!q && value) setQ(value)
  }, [value])

  useEffect(() => {
    const ctrl = new AbortController()
    const run = async () => {
      const url = `/api/banks/search?q=${encodeURIComponent(q)}&limit=10`
      try {
        const r = await fetch(url, { signal: ctrl.signal })
        if (!r.ok) return
        const j = (await r.json()) as BankOption[]
        setOpts(j)
      } catch {}
    }
    // fetch on mount + when query changes (debounce-ish)
    const t = setTimeout(run, 120)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  // when the text matches an option exactly, emit change with its id
  useEffect(() => {
    const m = opts.find(o => o.name.toLowerCase() === q.toLowerCase())
    if (m) onChange(m)
  }, [q, opts, onChange])

  return (
    <div className="relative">
      <input
        list="bank-options"
        className="w-full rounded-xl border px-3 py-2"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
      />
      <datalist id="bank-options">
        {opts.map(o => (
          <option key={`${o.id ?? o.name}`} value={o.name}>
            {o.code ? `${o.name} (${o.code})` : o.name}
          </option>
        ))}
      </datalist>
    </div>
  )
}

export default function CreateLedgerClient() {
  const [cats, setCats] = useState<Cat[]>([])
  const [catId, setCatId] = useState<string>('')

  const selectedCat = useMemo(
    () => cats.find((c) => c._id === catId) || null,
    [cats, catId],
  )

  const isPartyLedger = !!selectedCat && (/party/i.test(selectedCat.name) || /party/i.test(selectedCat.slug))
  const isBankLedger  = !!selectedCat && (/bank/i.test(selectedCat.name)  || /bank/i.test(selectedCat.slug))

  // party selector state
  const [party, setParty] = useState<PartyOption>({ name: '' })
  // bank selector state
  const [bank, setBank]   = useState<BankOption>({ name: '' })

  // the selected account for this ledger (party OR bank)
  const selectedAccountId   = isPartyLedger ? party.id : isBankLedger ? bank.id : undefined
  const selectedAccountName = isPartyLedger ? party.name : isBankLedger ? bank.name : ''

  const [accountClosing, setAccountClosing] = useState<number>(0) // outstanding prior to this sheet
  const seededFirstRow = useRef<boolean>(false)

  const [title, setTitle] = useState<string>('Ledger')
  useEffect(() => {
    if (selectedCat) setTitle(`${selectedCat.name} — Ledger`)
  }, [selectedCat])

  const [columns, setColumns] = useState<Column[]>([
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'totalDue', label: 'Total Due', type: 'number' },
    { key: 'debit', label: 'Debit', type: 'number' },
    { key: 'credit', label: 'Credit', type: 'number' },
  ])

  // enforce structure when the ledger type toggles (same structure for both)
  useEffect(() => {
    if (!isPartyLedger && !isBankLedger) return
    setColumns(() => ([
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'totalDue', label: 'Total Due', type: 'number' },
      { key: 'debit', label: 'Debit', type: 'number' },
      { key: 'credit', label: 'Credit', type: 'number' },
    ]))
  }, [isPartyLedger, isBankLedger])

  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 10 }, () => ({} as Row)))
  const [saving, setSaving] = useState<boolean>(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // load categories
  useEffect(() => {
    fetch('/api/categories').then((r) => r.json()).then((data: Cat[]) => setCats(data))
  }, [])

  // helper: safe numeric parse
  const num = (v: unknown): number => Number(v || 0)

  // fetch closing when selected account changes
  useEffect(() => {
    seededFirstRow.current = false
    setAccountClosing(0)
    const run = async () => {
      if (!selectedAccountId) return
      const today = dayjs().format('YYYY-MM-DD')
      const res = await fetch(`/api/transactions?accountId=${encodeURIComponent(selectedAccountId)}&from=1970-01-01&to=${today}&period=day`)
      if (!res.ok) return
      const data = await res.json() as { opening: number; rows: Array<{ runningBalance: number }> }
      const closing = data.rows.length
        ? Number(data.rows[data.rows.length - 1]?.runningBalance || 0)
        : Number(data.opening || 0)
      setAccountClosing(closing)
    }
    void run()
  }, [selectedAccountId])

  // compute per-row remaining: start from accountClosing; each row adds totalDue - credit
  const perRowRemaining: number[] = useMemo(() => {
    let rem = accountClosing
    const out: number[] = []
    for (const r of rows) {
      rem += num(r['totalDue']) - num(r['credit'])
      out.push(rem)
    }
    return out
  }, [rows, accountClosing])

  // totals for footer cards
  const totals = useMemo(() => {
    let due = 0; let debit = 0; let credit = 0
    for (const r of rows) {
      due += num(r['totalDue'])
      debit += num(r['debit'])
      credit += num(r['credit'])
    }
    const remaining = (accountClosing + due - credit)
    return { due, debit, credit, remaining }
  }, [rows, accountClosing])

  function addRows(n: number): void {
    setRows((prev) => [...prev, ...Array.from({ length: n }, () => ({} as Row))])
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

  // seed first empty row with closing once after selecting account
  useEffect(() => {
    if (!(isPartyLedger || isBankLedger) || !selectedAccountId || seededFirstRow.current === true) return
    const idx = rows.findIndex((r) => !r['date'] && !r['description'] && !r['totalDue'] && !r['debit'] && !r['credit'])
    if (idx >= 0 && accountClosing > 0) {
      setRows((prev) => {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], totalDue: accountClosing }
        return copy
      })
      seededFirstRow.current = true
    }
  }, [isPartyLedger, isBankLedger, selectedAccountId, accountClosing, rows])

  // when a date is entered on a row that has empty Total Due -> fill with previous row's Remaining
  function onDateChanged(rIdx: number, iso: string): void {
    setRows((prev) => {
      const copy = [...prev]
      const row: Row = { ...(copy[rIdx] || {}) }
      row['date'] = iso
      // only fill if empty
      const hasTotal = row['totalDue'] != null && row['totalDue'] !== ''
      if (!hasTotal) {
        const prevRemaining = rIdx > 0 ? perRowRemaining[rIdx - 1] ?? accountClosing : accountClosing
        row['totalDue'] = prevRemaining
      }
      copy[rIdx] = row
      return copy
    })
  }

  function formatNumber(n: number | null | undefined): string {
    return Number(n || 0).toLocaleString()
  }

  async function save(): Promise<void> {
    const customCols = columns.filter((c) => !CORE_KEYS.has(c.key))
    const payload = rows.map((r) => {
      const meta: Record<string, unknown> = {}
      for (const col of customCols) {
        const v = r[col.key]
        if (v !== null && v !== '' && v !== undefined) meta[col.key] = v
      }
      const accountId = (r['partyId'] as string | undefined) || selectedAccountId || null
      return {
        voucherNo: (r['voucherNo'] as string) || '',
        date: r['date'] ? dayjs(r['date'] as string | number | Date).format('YYYY-MM-DD') : undefined,
        description: (r['description'] as string) || '',
        debit: r['debit'] ? Number(r['debit']) : 0,
        credit: r['credit'] ? Number(r['credit']) : 0,
        // keep field name as partyId to match your existing /api/transactions/bulk
        // (backend already treats it as "accountId")
        partyId: accountId,
        meta,
      }
    })

    const filtered = payload.filter(
      (p) => p.date || p.debit || p.credit || p.description || p.voucherNo
    )

    setSaving(true)
    setSaveMsg(null)
    const res = await fetch('/api/transactions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: catId || undefined, rows: filtered }),
    })
    setSaving(false)
    const json = await res.json().catch(() => ({} as { inserted?: number }))
    setSaveMsg(res.ok ? `Saved ${json.inserted || 0} entries` : 'Save failed')
  }

  function onMaybeAddRow(e: React.KeyboardEvent<HTMLInputElement>, rIdx: number, cIdx: number) {
    if (e.key !== 'Tab' || e.shiftKey) return
    const lastEditable = columns.length - 1 // Remaining col is computed
    if (rIdx === rows.length - 1 && cIdx === lastEditable - 1) {
      setTimeout(() => addRows(1), 0)
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="no-print rounded-2xl bg-white/80 p-4 shadow-xl ring-1 ring-slate-100 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="rounded-xl border px-3 py-2"
            value={catId}
            onChange={(e) => {
              setCatId(e.target.value)
              setParty({ name: '' })
              setBank({ name: '' })
              setAccountClosing(0)
              seededFirstRow.current = false
            }}
          >
            <option value="">Select ledger category</option>
            {cats.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          {isPartyLedger ? (
            <PartyAutocomplete
              value={party.name}
              onChange={(v) => setParty({ id: v.id, name: v.name, code: v.code })}
              placeholder="Select party…"
            />
          ) : isBankLedger ? (
            <BankAutocomplete
              value={bank.name}
              onChange={(v) => setBank({ id: v.id, name: v.name, code: v.code })}
              placeholder="Select bank…"
            />
          ) : (
            <div className="grid place-items-center rounded-xl border px-3 py-2 text-sm text-slate-500">
              (Party selector appears for Party Ledger · Bank selector for Bank Ledger)
            </div>
          )}

          <input
            className="rounded-xl border px-3 py-2"
            placeholder={`Print heading (e.g., ${selectedCat ? selectedCat.name : 'Ledger'})`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* live summary */}
        {(isPartyLedger || isBankLedger) && (
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-xl border px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                {isPartyLedger ? 'Party' : 'Bank'} Closing (current)
              </div>
              <div className="text-base font-semibold">{formatNumber(accountClosing)}</div>
            </div>
            <div className="rounded-xl border px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Σ Total Due (sheet)</div>
              <div className="text-base font-semibold">{formatNumber(totals.due)}</div>
            </div>
            <div className="rounded-xl border px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Σ Credit (paid)</div>
              <div className="text-base font-semibold">{formatNumber(totals.credit)}</div>
            </div>
            <div className="rounded-xl border px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Remaining after sheet</div>
              <div className="text-base font-semibold">{formatNumber(totals.remaining)}</div>
            </div>
          </div>
        )}

        {saveMsg && <div className="mt-2 text-sm text-blue-700">{saveMsg}</div>}
      </div>

      {/* SHEET */}
      <div className="relative overflow-x-auto rounded-2xl bg-white shadow-xl ring-1 ring-slate-100 print-area">
        <div className="no-print sticky top-0 z-20 bg-gradient-to-r from-blue-50 to-white px-3 py-2 text-center text-xs text-slate-600 md:hidden">
          Tip: you can scroll this table sideways →
        </div>

        <div className="only-print print-header">{FACTORY_NAME}</div>

        <div className="no-print">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              {columns.map((c) => {
                let width = '180px'
                if (c.key === 'date') width = '120px'
                else if (c.key === 'description') width = '260px'
                else if (c.type === 'number') width = '140px'
                return <col key={c.key} style={{ width }} />
              })}
              <col style={{ width: '140px' }} /> {/* Remaining */}
            </colgroup>

            <thead className="sticky top-0 z-10">
              <tr className="border-b">
                {columns.map((c, i) => (
                  <th key={c.key} className="bg-white px-3 py-2 text-left align-bottom">
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        value={c.label}
                        placeholder="Header"
                        title="Column header"
                        onChange={(e) => {
                          const v = e.target.value
                          setColumns((prev) =>
                            prev.map((col, idx) => (idx === i ? { ...col, label: v } : col)),
                          )
                        }}
                      />
                    </div>
                  </th>
                ))}
                <th className="bg-white px-3 py-2 text-right">Remaining</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, rIdx) => (
                <tr key={rIdx} className="border-b/50 hover:bg-slate-50/60">
                  {columns.map((c, cIdx) => {
                    const baseTd = c.type === 'number' ? 'px-3 py-2 text-right' : 'px-3 py-2'
                    const className = baseTd
                    const onTab = (e: React.KeyboardEvent<HTMLInputElement>) => onMaybeAddRow(e, rIdx, cIdx)

                    if (c.type === 'date') {
                      return (
                        <td key={c.key} className={className}>
                          <input
                            type="date"
                            className="w-full rounded-md border px-2 py-1"
                            value={r[c.key] ? dayjs(r[c.key] as string | number | Date).format('YYYY-MM-DD') : ''}
                            onChange={(e) => onDateChanged(rIdx, e.target.value)}
                            onKeyDown={onTab}
                            required={c.key === 'date'}
                          />
                        </td>
                      )
                    }

                    if (c.type === 'number') {
                      return (
                        <td key={c.key} className={className}>
                          <input
                            type="number"
                            className="w-full rounded-md border px-2 py-1 text-right"
                            value={(r[c.key] as number | null) ?? ''}
                            onChange={(e) => setCell(rIdx, c.key, e.target.value === '' ? null : Number(e.target.value))}
                            onKeyDown={onTab}
                          />
                        </td>
                      )
                    }

                    return (
                      <td key={c.key} className={className}>
                        <input
                          className="w-full rounded-md border px-2 py-1"
                          value={(r[c.key] as string) || ''}
                          onChange={(e) => setCell(rIdx, c.key, e.target.value)}
                          onKeyDown={onTab}
                          placeholder={c.key === 'description' ? 'Details…' : ''}
                        />
                      </td>
                    )
                  })}

                  {/* Per-row remaining */}
                  <td className="px-3 py-2 text-right font-medium">
                    {formatNumber(perRowRemaining[rIdx] ?? accountClosing)}
                  </td>
                </tr>
              ))}

              {/* Totals row */}
              <tr className="sticky bottom-0 bg-gradient-to-b from-slate-50 to-white">
                {columns.map((c, idx) => {
                  if (idx === 0) return <td key="t-l" className="px-3 py-2 text-xs">Totals</td>
                  if (c.key === 'totalDue') return <td key="t-due" className="px-3 py-2 text-right font-semibold">{formatNumber(totals.due)}</td>
                  if (c.key === 'debit') return <td key="t-debit" className="px-3 py-2 text-right font-semibold">{formatNumber(totals.debit)}</td>
                  if (c.key === 'credit') return <td key="t-credit" className="px-3 py-2 text-right font-semibold">{formatNumber(totals.credit)}</td>
                  return <td key={`t-${c.key}`} className="px-3 py-2" />
                })}
                <td className="px-3 py-2 text-right font-semibold">
                  {formatNumber(totals.remaining)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* PRINT */}
        <div className="only-print">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.type === 'number' ? 'text-right' : 'text-left'}>
                    {c.label || '\u00A0'}
                  </th>
                ))}
                <th className="text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`p-${i}`}>
                  {columns.map((c) => {
                    const raw = r[c.key]
                    let val = ''
                    if (c.type === 'date') val = raw ? (dayjs(raw as string | number | Date).isValid() ? dayjs(raw as string | number | Date).format('DD/MM/YYYY') : '') : ''
                    else if (c.type === 'number') val = Number(raw || 0).toLocaleString()
                    else val = (raw as string) || ''
                    return <td key={c.key} className={c.type === 'number' ? 'text-right' : ''}>{val}</td>
                  })}
                  <td className="text-right font-medium">
                    {Number(perRowRemaining[i] ?? accountClosing).toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr>
                {columns.map((c, idx) => {
                  if (idx === 0) return <td key="pt-l" className="text-xs">Totals</td>
                  if (c.key === 'totalDue') return <td key="pt-due" className="text-right font-semibold">{Number(totals.due).toLocaleString()}</td>
                  if (c.key === 'debit') return <td key="pt-debit" className="text-right font-semibold">{Number(totals.debit).toLocaleString()}</td>
                  if (c.key === 'credit') return <td key="pt-credit" className="text-right font-semibold">{Number(totals.credit).toLocaleString()}</td>
                  return <td key={`pt-${c.key}`} />
                })}
                <td className="text-right font-semibold">
                  {Number(totals.remaining).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="print-footer">{FACTORY_NAME}</div>
        </div>
      </div>

      {/* Actions */}
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
