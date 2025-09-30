'use client'

import { useEffect, useRef, useState } from 'react'

export type ProductLite = {
  _id: string
  name: string
  code?: string
  rate?: number
}

export default function ProductAutocomplete({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: { id?: string; name: string; code?: string; rate?: number }) => void
  placeholder?: string
}) {
  const [q, setQ] = useState(value || '')
  const [list, setList] = useState<ProductLite[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQ(value || '') }, [value])

  useEffect(() => {
    let live = true
    const t = setTimeout(async () => {
      const res = await fetch(`/api/products?q=${encodeURIComponent(q)}`)
      if (!live) return
      if (res.ok) setList(await res.json())
    }, 180)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange({ name: e.target.value }) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-md border px-2 py-1"
      />
      {open && list.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white text-sm shadow-soft">
          {list.map(p => (
            <button
              key={p._id}
              type="button"
              onClick={() => { onChange({ id: p._id, name: p.name, code: p.code, rate: p.rate }); setQ(p.name); setOpen(false) }}
              className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-xs opacity-70">{[p.code, (p.rate ?? undefined) && `Rate: ${p.rate}`].filter(Boolean).join(' • ')}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
