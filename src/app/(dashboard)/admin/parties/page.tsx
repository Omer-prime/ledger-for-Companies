'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Party = { _id: string; name: string; code?: string }

export default function PartiesPage() {
  const [list, setList] = useState<Party[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const debouncedQ = useDebouncedValue(q, 300)

  const filteredCount = useMemo(() => list.length, [list])

  async function load(query = ''): Promise<void> {
    setLoading(true)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const url = query ? `/api/parties?q=${encodeURIComponent(query)}` : '/api/parties'
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal })
      if (res.ok) setList(await res.json())
    } catch {
      /* aborted or failed */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])               // initial fetch
  useEffect(() => { void load(debouncedQ) }, [debouncedQ]) // debounced search

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) return
    const res = await fetch('/api/parties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code: code || undefined }),
    })
    if (res.ok) {
      setName('')
      setCode('')
      await load(q)
      // notify any open Create Ledger sheets to refresh their party autocomplete
      window.dispatchEvent(new CustomEvent('party:list-updated'))
    }
  }

  async function remove(id: string): Promise<void> {
    const ok = window.confirm('Delete this party? This cannot be undone.')
    if (!ok) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/parties/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setList(prev => prev.filter(p => p._id !== id))
        window.dispatchEvent(new CustomEvent('party:list-updated'))
      } else {
        console.error('Failed to delete party', await res.text())
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="space-y-4">
      {/* Header / Create */}
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-lg font-semibold">Parties</h1>
            <p className="text-sm text-slate-500">
              Add customers/suppliers here. They’ll be available instantly in Create&nbsp;Ledger.
            </p>
          </div>
          <div className="rounded-lg bg-blue-50 px-3 py-1 text-xs text-blue-700">
            {loading ? 'Loading…' : `${filteredCount} result${filteredCount === 1 ? '' : 's'}`}
          </div>
        </div>

        <form onSubmit={create} className="mt-4 grid gap-3 md:grid-cols-[1fr_200px_120px]">
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Party name (e.g., Mehrban Traders)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Code (optional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="rounded-xl bg-blue-600 px-4 py-2 text-white shadow-soft hover:bg-blue-700">
            Add
          </button>
        </form>
      </section>

      {/* Search + List */}
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1">
            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Search parties by name or code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            />
          </div>
          <div className="text-xs text-slate-500">
            Tip: Type to search — results update automatically.
          </div>
        </div>

        {/* Responsive table -> card rows on small screens */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="hidden sm:table-header-group">
              <tr className="border-b">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody aria-busy={loading}>
              {loading && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && list.map((p) => (
                <tr key={p._id} className="border-b/50 sm:table-row block rounded-lg border sm:border-0 sm:rounded-none sm:bg-transparent mb-3 sm:mb-0">
                  <td className="px-3 py-2 block sm:table-cell">
                    <div className="font-medium text-slate-800">{p.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500 sm:hidden">
                      Code: {p.code || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell">{p.code || '—'}</td>
                  <td className="px-3 py-2 text-left sm:text-center">
                    <button
                      onClick={() => void remove(p._id)}
                      disabled={deletingId === p._id}
                      className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Delete party"
                    >
                      {deletingId === p._id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && list.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                    No parties found.
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

/* -------------------- small hook: debounce -------------------- */
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}
