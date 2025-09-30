'use client'

import { useEffect, useState } from 'react'

type Cat = { _id: string; name: string; slug: string }

export default function CategoriesPage() {
  const [list, setList] = useState<Cat[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load(): Promise<void> {
    const res = await fetch('/api/categories', { cache: 'no-store' })
    if (res.ok) setList(await res.json())
  }
  useEffect(() => { void load() }, [])

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        setName('')
        await load()
      }
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: string): Promise<void> {
    const ok = window.confirm('Delete this category? Ledgers using it may be affected.')
    if (!ok) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setList((prev) => prev.filter((c) => c._id !== id))
      } else {
        console.error('Failed to delete category', await res.text())
      }
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <main className="space-y-4">
      <div className="rounded-2xl bg-white p-6 shadow-soft">
        <h1 className="text-lg font-semibold">Ledger Categories</h1>

        <form onSubmit={create} className="mt-4 flex flex-col gap-3 md:flex-row">
          <input
            className="flex-1 rounded-xl border px-3 py-2"
            placeholder="e.g. Party Ledger, Client Payments, Bank Payments"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button
            type="submit"
            className="flex-shrink-0 rounded-xl bg-blue-600 px-5 py-2 text-white shadow-soft hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? 'Adding…' : 'Add Category'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Search categories…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((c) => (
            <li key={c._id} className="flex items-start justify-between rounded-xl border p-4">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs opacity-60">{c.slug}</div>
              </div>
              <button
                onClick={() => void remove(c._id)}
                disabled={deletingId === c._id}
                className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                title="Delete category"
              >
                {deletingId === c._id ? 'Deleting…' : 'Delete'}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="rounded-xl border p-6 text-center text-sm text-slate-500">
              No categories found.
            </li>
          )}
        </ul>
      </div>
    </main>
  )
}
