'use client'

import { useEffect, useState } from 'react'

type Product = {
  _id: string
  name: string
  code?: string
  price: number | null
  unit: string
}

export default function ProductsPage() {
  const [list, setList] = useState<Product[]>([])
  const [form, setForm] = useState<{ name: string; code?: string; price?: number; unit?: string }>({
    name: '',
    code: '',
    price: undefined,
    unit: '',
  })
  const [q, setQ] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load(query = ''): Promise<void> {
    setLoading(true)
    try {
      const url = query ? `/api/products?q=${encodeURIComponent(query)}` : '/api/products'
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) setList(await res.json())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ name: '', code: '', price: undefined, unit: '' })
      void load(q)
    }
  }

  async function remove(id: string): Promise<void> {
    const ok = window.confirm('Delete this product? This cannot be undone.')
    if (!ok) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setList((prev) => prev.filter((p) => p._id !== id))
      } else {
        console.error('Failed to delete product', await res.text())
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="space-y-4">
      <div className="rounded-2xl bg-white p-6 shadow-soft">
        <h1 className="text-lg font-semibold">Products</h1>
        <form onSubmit={create} className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_160px_160px_120px]">
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Product name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Code / SKU"
            value={form.code || ''}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value || undefined }))}
          />
          <input
            className="rounded-xl border px-3 py-2"
            type="number"
            placeholder="Price"
            value={form.price ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, price: e.target.value === '' ? undefined : Number(e.target.value) }))
            }
          />
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Unit (e.g., pcs, kg, m)"
            value={form.unit || ''}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value || undefined }))}
          />
          <button className="rounded-xl bg-brand/90 px-4 py-2 text-white shadow-soft hover:bg-brand">
            Add
          </button>
        </form>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-3 flex items-center gap-2">
          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Search products…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load(q)}
          />
          <button onClick={() => void load(q)} className="rounded-xl border px-4 py-2 shadow-soft hover:bg-slate-50">
            Search
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-left">Unit</th>
                <th className="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody aria-busy={loading}>
              {list.map((p) => (
                <tr key={p._id} className="border-b/50">
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2">{p.code || '—'}</td>
                  <td className="px-3 py-2 text-right">{p.price != null ? p.price.toLocaleString() : '—'}</td>
                  <td className="px-3 py-2">{p.unit || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => void remove(p._id)}
                      disabled={deletingId === p._id}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Delete product"
                    >
                      {deletingId === p._id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
