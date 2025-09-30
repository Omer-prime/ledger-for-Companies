'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type PartyOption = {
  id?: string
  name: string
  code?: string
}

type ApiParty = { _id: string; name: string; code?: string }

export default function PartyAutocomplete({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: PartyOption) => void
  placeholder?: string
}) {
  const [q, setQ] = useState<string>(value || '')
  const [open, setOpen] = useState<boolean>(false)
  const [list, setList] = useState<ApiParty[]>([])
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const boxRef = useRef<HTMLDivElement>(null)

  // keep input in sync with parent value
  useEffect(() => { setQ(value || '') }, [value])

  // fetch (debounced)
  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      const url = `/api/parties?q=${encodeURIComponent(q)}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!alive) return
      if (res.ok) {
        const data = (await res.json()) as ApiParty[]
        setList(data)
        setActiveIndex(data.length ? 0 : -1)
      }
    }, 180)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  // click outside to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function choose(p: ApiParty): void {
    onChange({ id: p._id, name: p.name, code: p.code })
    setQ(p.name)
    setOpen(false)
  }

  const hasResults = useMemo(() => list.length > 0, [list])

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange({ name: e.target.value }) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? 'Search party…'}
        className="w-full rounded-md border px-2 py-1"
        role="combobox"
        aria-expanded={open}
        aria-controls="party-autocomplete-listbox"
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((i) => Math.min((i < 0 ? -1 : i) + 1, list.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((i) => Math.max((i < 0 ? list.length : i) - 1, 0))
          } else if (e.key === 'Enter' && activeIndex >= 0 && list[activeIndex]) {
            e.preventDefault()
            choose(list[activeIndex]!)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />

      {open && hasResults && (
        <ul
          id="party-autocomplete-listbox"
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white text-sm shadow-soft"
        >
          {list.map((p, i) => {
            const active = i === activeIndex
            return (
              <li key={p._id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={[
                    'block w-full px-3 py-2 text-left transition',
                    active ? 'bg-blue-50' : 'hover:bg-slate-50',
                  ].join(' ')}
                >
                  <div className="text-sm">{p.name}</div>
                  <div className="text-xs text-slate-500">Code: {p.code || '—'}</div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
