'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

type ContactKind = 'customer' | 'supplier' | 'processor' | 'general'
type Tab = ContactKind | 'all'
type Contact = { _id: string; name: string; code?: string; phone?: string; address?: string; kind?: ContactKind }

const tabs: { value: Tab; label: string }[] = [
  { value: 'customer', label: 'Customers' },
  { value: 'supplier', label: 'Fabric suppliers' },
  { value: 'processor', label: 'Dyeing processors' },
  { value: 'general', label: 'Older accounts' },
  { value: 'all', label: 'All contacts' },
]
const labels: Record<ContactKind, string> = {
  customer: 'Customer', supplier: 'Fabric supplier', processor: 'Dyeing processor', general: 'Existing account',
}
const inputStyle = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'

export default function ContactsPage() {
  const [tab, setTab] = useState<Tab>('customer')
  const [list, setList] = useState<Contact[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [query, setQuery] = useState('')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  // Links from the warehouse open the appropriate contact type automatically.
  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get('type')
    if (type === 'supplier' || type === 'processor' || type === 'customer') setTab(type)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const url = query.trim() ? `/api/parties?q=${encodeURIComponent(query.trim())}&limit=300` : '/api/parties?limit=300'
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Could not load contacts')
        setList(await response.json())
      } catch (err) {
        if (!controller.signal.aborted) setNotice(err instanceof Error ? err.message : 'Could not load contacts')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 150)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, reload])

  const visible = useMemo(() => list.filter(item => tab === 'all' || (item.kind ?? 'general') === tab), [list, tab])
  const addKind: ContactKind = tab === 'all' || tab === 'general' ? 'customer' : tab

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !name.trim()) return
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch('/api/parties', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), ...(code.trim() ? { code: code.trim() } : {}), kind: addKind, phone, address }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error ?? (response.status === 403 ? 'An administrator must add contacts.' : 'Could not add contact.'))
      setName('')
      setCode('')
      setPhone('')
      setAddress('')
      setReload(n => n + 1)
      setNotice(`${labels[addKind]} added successfully.`)
      window.dispatchEvent(new CustomEvent('party:list-updated'))
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not add contact')
    } finally { setSaving(false) }
  }

  async function archive(id: string, displayName: string) {
    if (!window.confirm(`Archive ${displayName}? Existing ledger and warehouse history will remain.`)) return
    setBusyId(id)
    setNotice('')
    try {
      const response = await fetch(`/api/parties/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not archive this account. You may need administrator access.')
      setReload(n => n + 1)
      setNotice(`${displayName} archived. Historical records are retained.`)
      window.dispatchEvent(new CustomEvent('party:list-updated'))
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Archive failed')
    } finally { setBusyId(null) }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-2xl bg-slate-900 p-6 text-white">
        <p className="text-xs uppercase tracking-widest text-blue-200">OarLinks / Contacts</p>
        <h1 className="mt-2 text-2xl font-semibold">Customers, Suppliers & Dyeing Processors</h1>
        <p className="mt-2 text-sm text-slate-300">Keep your regular customers and factory suppliers organized in one place. Walk-in cash buyers do not need an account.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/admin/warehouse" className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900">Back to Fabric Warehouse</Link>
          <Link href="/admin/checkout" className="rounded-lg border border-slate-400 px-3 py-2 text-sm text-white">Go to POS</Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold">Who do you want to add?</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Contact types">
          {tabs.map(item => <button key={item.value} type="button" onClick={() => { setTab(item.value); setNotice('') }} aria-pressed={tab === item.value}
            className={'rounded-lg border px-3 py-2 text-sm ' + (tab === item.value ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700')}>
            {item.label}
          </button>)}
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {addKind === 'supplier' ? 'A fabric supplier provides raw/kora fabric to your warehouse.' :
            addKind === 'processor' ? 'A dyeing processor receives fabric for dyeing and sends it back.' :
              'A customer regularly purchases fabric or suits. One-time walk-in customers can be handled directly at the POS.'}
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_120px]" onSubmit={create}>
          <label className="text-sm">{labels[addKind]} name
            <input className={inputStyle} maxLength={500} value={name} onChange={e => setName(e.target.value)} placeholder={addKind === 'supplier' ? 'e.g. Lahore Textile Mills' : addKind === 'processor' ? 'e.g. Fine Dyeing House' : 'e.g. Ahmed Fabrics'} required />
          </label>
          <label className="text-sm">Account code (optional)
            <input className={inputStyle} maxLength={500} value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. SUP-001" />
          </label>
          <label className="text-sm">Phone (optional)<input type="tel" className={inputStyle} maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} /></label>
          <label className="text-sm">Address (optional)<input className={inputStyle} maxLength={500} value={address} onChange={e => setAddress(e.target.value)} /></label>
          <div className="flex items-end"><button disabled={saving} className="w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Add account'}</button></div>
        </form>
        {notice && <p role="status" className="mt-3 text-sm text-blue-800">{notice}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{tabs.find(item => item.value === tab)?.label}</h2>
            <p className="text-sm text-slate-600">{loading ? 'Loading accounts...' : `${visible.length} account(s) shown`}</p>
          </div>
          <label className="text-sm w-full sm:max-w-sm">Search name or code
            <input className={inputStyle} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search contacts..." />
          </label>
        </div>
        {tab === 'general' && <p className="mt-3 text-sm text-amber-800">Older accounts have no category yet. They remain available to existing operations. New contacts will be categorized automatically.</p>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Code</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
            <tbody>
              {visible.map(item => <tr key={item._id} className="border-b border-slate-100">
                <td className="px-3 py-3 font-medium">{item.name}{item.phone && <span className="block text-xs">{item.phone}</span>}{item.address && <span className="block text-xs">{item.address}</span>}</td>
                <td className="px-3 py-3">{labels[item.kind ?? 'general']}</td>
                <td className="px-3 py-3">{item.code || '-'}</td>
                <td className="px-3 py-3 text-right"><button type="button" disabled={busyId === item._id} onClick={() => void archive(item._id, item.name)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50">{busyId === item._id ? 'Archiving...' : 'Archive'}</button></td>
              </tr>)}
              {!loading && visible.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No accounts of this type yet. Use the form above to add one.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">This list shows up to 300 matches. Archived contacts disappear from selection lists but past records remain.</p>
      </section>
    </main>
  )
}
