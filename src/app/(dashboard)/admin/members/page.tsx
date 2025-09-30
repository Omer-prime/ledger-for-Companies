'use client'

import { useEffect, useMemo, useState } from 'react'

type Role = 'superadmin' | 'admin' | 'manager' | 'accountant'
type User = { _id: string; name?: string; email: string; role: Role }

const ROLE_META: Record<Role, { label: string; cls: string }> = {
  superadmin: { label: 'Super Admin', cls: 'bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white' },
  admin:      { label: 'Admin',       cls: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' },
  manager:    { label: 'Manager',     cls: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white' },
  accountant: { label: 'Accountant',  cls: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white' },
}

function RoleBadge({ role }: { role: Role }) {
  const meta = ROLE_META[role]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium shadow ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

function Avatar({ name, email }: { name?: string; email: string }) {
  const initial = (name || email)?.charAt(0)?.toUpperCase() || 'U'
  return (
    <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-slate-200 to-slate-100 text-slate-700 ring-1 ring-white/60 shadow">
      <span className="text-sm font-semibold">{initial}</span>
    </div>
  )
}

export default function MembersPage() {
  const [list, setList] = useState<User[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [form, setForm] = useState<{ name?: string; email: string; role: Role; password: string }>({
    name: '', email: '', role: 'accountant', password: ''
  })

  async function load() {
    setLoading(true)
    setErr(null)
    const res = await fetch('/api/users', { cache: 'no-store' })
    setLoading(false)
    if (res.ok) setList(await res.json())
    else setErr('Could not load team. Try again.')
  }
  useEffect(() => { void load() }, [])

  function generatePassword() {
    // simple strong-ish pass for local dev MVP
    const p = Math.random().toString(36).slice(-6) + Math.random().toString(36).toUpperCase().slice(-6)
    setForm(f => ({ ...f, password: p }))
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    setErr(null)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (res.ok) {
      setForm({ name: '', email: '', role: 'accountant', password: '' })
      setMsg('Member added')
      await load()
      setTimeout(() => setMsg(null), 2000)
    } else {
      setErr('Failed — only superadmin/admin can add.')
    }
  }

  const filtered = useMemo(() => {
    if (!filter.trim()) return list
    const q = filter.toLowerCase()
    return list.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q),
    )
  }, [list, filter])

  // group by role for a tidy table view (desktop)
  const grouped = useMemo(() => {
    const order: Role[] = ['superadmin', 'admin', 'manager', 'accountant']
    return order.map(r => ({ role: r, users: filtered.filter(u => u.role === r) }))
  }, [filtered])

  return (
    <main className="space-y-5">
      {/* Add member (glass/3D) */}
      <section className="rounded-2xl bg-white/80 p-6 shadow-xl ring-1 ring-slate-100 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Add Member</h1>
          <span className="text-xs text-slate-500">Passwords are plain-text for local MVP only — swap for hashed auth later.</span>
        </div>

        <form onSubmit={add} className="mt-4 grid gap-3 md:grid-cols-5">
          <input
            className="rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
            placeholder="Full name"
            value={form.name || ''}
            onChange={e=>setForm(f=>({ ...f, name: e.target.value }))}
          />
          <input
            className="rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={e=>setForm(f=>({ ...f, email: e.target.value }))}
            required
          />
          <select
            className="rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
            value={form.role}
            onChange={e=>setForm(f=>({ ...f, role: e.target.value as Role }))}
          >
            <option value="superadmin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="accountant">Accountant</option>
          </select>
          <div className="flex gap-2">
            <input
              className="w-full rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
              placeholder="Password"
              value={form.password}
              onChange={e=>setForm(f=>({ ...f, password: e.target.value }))}
              required
            />
            <button
              type="button"
              onClick={generatePassword}
              className="shrink-0 rounded-xl border px-3 py-2 text-sm shadow hover:bg-slate-50"
              title="Generate password"
            >
              ⚡
            </button>
          </div>
          <div className="md:col-span-5 flex items-center gap-3">
            <button
              disabled={loading}
              className="rounded-xl bg-blue-600 px-4 py-2 text-white shadow-lg hover:bg-blue-700 active:translate-y-[1px] disabled:opacity-60"
            >
              {loading ? 'Adding…' : 'Add Member'}
            </button>
            {msg && <span className="text-sm text-emerald-700">{msg}</span>}
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </form>
      </section>

      {/* Search / summary */}
      <section className="rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <h2 className="font-medium tracking-tight">Team</h2>
            <p className="text-xs text-slate-500">{filtered.length} member{filtered.length === 1 ? '' : 's'}</p>
          </div>
          <input
            className="w-full rounded-xl border px-3 py-2 shadow sm:w-72"
            placeholder="Search name, email, or role…"
            value={filter}
            onChange={(e)=>setFilter(e.target.value)}
          />
        </div>
      </section>

      {/* Mobile cards */}
      <section className="grid gap-3 sm:hidden">
        {loading && (
          <div className="animate-pulse rounded-2xl bg-white p-4 shadow ring-1 ring-slate-100">
            <div className="h-4 w-24 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-48 rounded bg-slate-200" />
          </div>
        )}
        {!loading && filtered.map(u => (
          <div key={u._id} className="rounded-2xl bg-white p-4 shadow ring-1 ring-slate-100">
            <div className="flex items-center gap-3">
              <Avatar name={u.name} email={u.email} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{u.name || '—'}</div>
                <div className="truncate text-xs text-slate-500">{u.email}</div>
              </div>
              <div className="ml-auto">
                <RoleBadge role={u.role} />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Desktop table with subtle 3D header */}
      <section className="hidden overflow-x-auto rounded-2xl bg-white shadow-xl ring-1 ring-slate-100 sm:block">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gradient-to-b from-white to-slate-50 shadow-[inset_0_-1px_0_rgb(0_0_0/0.06)]">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Role</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-500">Loading…</td>
              </tr>
            )}
            {!loading && grouped.map(g => (
              <tr key={g.role} className="border-t">
                <td colSpan={3} className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                  {ROLE_META[g.role].label}
                </td>
              </tr>
            ))}

            {!loading && filtered.map(u => (
              <tr key={u._id} className="border-b/50 hover:bg-slate-50/60">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={u.name} email={u.email} />
                    <span className="font-medium text-slate-800">{u.name || '—'}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{u.email}</span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(u.email)}
                      className="rounded border px-1 text-xs text-slate-600 hover:bg-slate-50"
                      title="Copy email"
                    >
                      Copy
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <RoleBadge role={u.role} />
                </td>
              </tr>
            ))}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-500">No members.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  )
}
