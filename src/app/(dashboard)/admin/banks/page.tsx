'use client'

import { useEffect, useState } from 'react'

type Bank = { _id: string; name: string; code?: string }

export default function BanksPage() {
  const [list, setList] = useState<Bank[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [q, setQ] = useState('')

  async function load(query = '') {
    const url = query ? `/api/banks?q=${encodeURIComponent(query)}` : '/api/banks'
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) setList(await res.json())
  }
  useEffect(() => { void load() }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/banks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code: code || undefined })
    })
    if (res.ok) { setName(''); setCode(''); void load(q) }
  }

  return (
    <main className="space-y-4">
      <div className="rounded-2xl bg-white p-6 shadow-soft">
        <h1 className="text-lg font-semibold">Banks</h1>
        <form onSubmit={create} className="mt-4 grid gap-3 md:grid-cols-[1fr_200px_160px]">
          <input className="rounded-xl border px-3 py-2" placeholder="Bank name" value={name} onChange={e=>setName(e.target.value)} required />
          <input className="rounded-xl border px-3 py-2" placeholder="Code (optional)" value={code} onChange={e=>setCode(e.target.value)} />
          <button className="rounded-xl bg-brand/90 px-4 py-2 text-white shadow-soft hover:bg-brand">Add</button>
        </form>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <input className="w-full rounded-xl border px-3 py-2" placeholder="Search banks…" value={q} onChange={e=>setQ(e.target.value)} />
          <button onClick={()=>void load(q)} className="rounded-xl border px-4 py-2 shadow-soft hover:bg-slate-50">Search</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b"><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Code</th></tr></thead>
            <tbody>
              {list.map(b=>(
                <tr key={b._id} className="border-b/50">
                  <td className="px-3 py-2">{b.name}</td>
                  <td className="px-3 py-2">{b.code || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
