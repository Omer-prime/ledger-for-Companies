'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatMicrometers, formatValuationPKR, integralMongoDecimal, pkrToMinorPerMeter } from '@/lib/warehouse-values'

type Kind = 'receipt' | 'dispatch' | 'return'
type ContactKind = 'customer' | 'supplier' | 'processor' | 'general'
type Data = {
  balances: { _id: { stage: string; currency: string }; um: string; valueNumerator: string }[]
  lots: { _id: string; fabric: string; supplier: string; balances: Record<string, number> }[]
  jobs: { _id: string; lotId: string; processor: string; outstandingUm: number }[]
  events: { _id: string; lotId: string; jobId?: string; processor?: string; postedAt: string; reason?: string; legs: { from: string; to: string; um: number }[] }[]
  accounts: { _id: string; name: string; kind?: ContactKind }[]
  outstandingJobs: number
  canPost: boolean
}

const meters = (um: number | string | bigint) => formatMicrometers(um) + ' m'
const actions: Record<Kind, string> = {
  receipt: 'Receive raw fabric',
  dispatch: 'Send for dyeing',
  return: 'Receive dyed fabric',
}
const fields = 'block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const card = 'min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6'

export default function WarehousePage() {
  const [data, setData] = useState<Data | null>(null)
  const [kind, setKind] = useState<Kind>('receipt')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [exception, setException] = useState(false)
  const lock = useRef(false)

  async function refresh() {
    const response = await fetch('/api/warehouse', { cache: 'no-store' })
    if (!response.ok) throw new Error('Warehouse could not be loaded.')
    setData(await response.json())
  }

  useEffect(() => { void refresh().catch(() => setNotice('Warehouse could not be loaded.')) }, [])

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    // Do not send the rupee UI field to the strict backend; preserve the existing
    // minorPerMeter wire representation and idempotent document fingerprints.
    let body: Record<string, FormDataEntryValue | string | number>
    try {
      if (kind === 'receipt') {
        const { rupeesPerMeter, ...other } = values
        body = { ...other, kind, currency: 'PKR', minorPerMeter: pkrToMinorPerMeter(String(rupeesPerMeter ?? '')) }
      } else {
        body = { ...values, kind }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Invalid cost per meter.')
      return
    }
    lock.current = true
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch('/api/warehouse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (response.status !== 200 && response.status !== 201) {
        if (response.status >= 400 && response.status < 500) {
          const result = await response.json().catch(() => null)
          setNotice(result?.error ?? 'Warehouse document was rejected. Check the fields and retry.')
          return
        }
        throw new Error('Posting confirmation unavailable')
      }
      form.reset()
      setException(false)
      setNotice(response.status === 200 ? 'This document was already posted.' : 'Warehouse document posted successfully.')
      await refresh().catch(() => {
        setNotice('Document posted successfully, but warehouse data could not be refreshed.')
      })
    } catch {
      setNotice('Posting could not be confirmed. Retry with the SAME document reference and values; do not make a new reference.')
    } finally {
      lock.current = false
      setSaving(false)
    }
  }

  function total(stage: string) {
    return data?.balances.filter(item => item._id.stage === stage)
      .reduce((sum, item) => sum + integralMongoDecimal(item.um), BigInt(0)) ?? BigInt(0)
  }

  const relevantAccounts = data?.accounts.filter(account => {
    // New named customer records are not warehouse suppliers/processors.
    // Historic unclassified accounts remain selectable for backward compatibility.
    if (kind === 'receipt') return account.kind === 'supplier' || account.kind === 'general' || !account.kind
    if (kind === 'dispatch') return account.kind === 'processor' || account.kind === 'general' || !account.kind
    return true
  }) ?? []

  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-4">
      <header className="rounded-2xl bg-slate-900 p-6 text-white">
        <p className="text-xs font-semibold tracking-widest text-blue-200 uppercase">OarLinks / Warehouse</p>
        <h1 className="mt-2 text-3xl font-semibold">Fabric Warehouse</h1>
        <p className="mt-2 text-sm text-slate-300">Record raw fabric received, fabric sent for dyeing and dyed fabric returned.</p>
        <div className="mt-4 flex flex-wrap gap-4">
          <Link href="/admin/warehouse/production" className="underline">Allocate for cutting</Link>
          <Link href="/admin/warehouse/production#finished-inventory" className="underline">Finished suits and thaans</Link>
        </div>
        <p className="mt-2 text-sm text-slate-300">Other Product Inventory tracks a separate stock system. Textile quantities are not included there.</p>
      </header>
      <p role="status" className="text-sm text-slate-700">{notice || (!data && 'Loading warehouse...')}</p>
      {data && <>
        <section aria-label="Warehouse totals" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ['Raw fabric available', meters(total('greige'))],
            ['Sent out for dyeing', meters(total('processor'))],
            ['Dyed fabric available', meters(total('dyed'))],
            ['Unfinished dyeing jobs', String(data.outstandingJobs)],
          ].map(([label, value]) => (
            <div key={label} className={card}><p className="text-xs text-slate-600">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>
          ))}
        </section>
        {data.canPost && <section className={card}>
          <h2 className="text-lg font-semibold">Record a warehouse movement</h2>
          <p className="mt-1 text-sm text-slate-600">Use one unique challan/document number for each receiving, dispatch or return. The same number and details can be retried safely.</p>
          <div className="my-3 flex flex-wrap gap-2">
            {(Object.keys(actions) as Kind[]).map(action => (
              <button key={action} type="button" aria-pressed={kind === action} disabled={saving} onClick={() => { if (kind !== action) setException(false); setKind(action) }}
                className={'rounded-lg border px-3 py-2 text-sm ' + (kind === action ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300')}>{actions[action]}</button>
            ))}
          </div>
          <form key={kind} onSubmit={post} onChange={event => {
            if (kind !== 'return') return
            const values = new FormData(event.currentTarget)
            setException(['damaged', 'rejected', 'lost'].some(field => Number(values.get(field)) > 0))
          }}>
            <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Challan / Document number
                <input className={fields} name="reference" maxLength={64} placeholder={kind === 'receipt' ? 'e.g. GR-20261112-001' : kind === 'dispatch' ? 'e.g. DYE-20261112-001' : 'e.g. RET-20261112-001'} required />
              </label>
              <label className="text-sm">Length unit<select className={fields} name="unit"><option value="m">Meters</option><option value="yd">Yards</option></select></label>
              {kind !== 'return' && <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="warehouse-contact" className="text-sm">{kind === 'receipt' ? 'Fabric supplier' : 'Dyeing processor'}</label>
                    <Link className="text-sm font-medium text-blue-700 underline" href={kind === 'receipt' ? '/admin/parties?type=supplier' : '/admin/parties?type=processor'}>
                      {kind === 'receipt' ? '+ Add supplier' : '+ Add dyeing processor'}
                    </Link>
                  </div>
                  <select id="warehouse-contact" className={fields} name={kind === 'receipt' ? 'supplierId' : 'processorId'} required>
                    <option value="">Select {kind === 'receipt' ? 'supplier' : 'processor'}</option>
                    {relevantAccounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}
                  </select>
                  {relevantAccounts.length === 0 && <p className="text-xs text-amber-700">No matching account yet. Add one using the link above, then return here.</p>}
                </div>
                <label className="text-sm">Fabric length<input className={fields} name="quantity" inputMode="decimal" placeholder="e.g. 100" required /></label>
              </>}
              {kind === 'receipt' && <>
                <label className="text-sm">Fabric description<input className={fields} name="fabric" maxLength={500} placeholder="e.g. White cotton 80x80" required /></label>
                <label className="text-sm">Purchase cost per meter (PKR / Rs)
                  <input className={fields} name="rupeesPerMeter" type="number" step="0.01" min="0" max="10000000" placeholder="e.g. 300" required />
                  <span className="block mt-1 text-xs text-slate-500">Enter 300 for Rs 300 per meter. No paisa conversion needed.</span>
                </label>
              </>}
              {kind === 'dispatch' && <label className="text-sm">Original raw fabric challan number<input className={fields} name="lotId" list="greige-lots" required maxLength={64} placeholder="Choose original receiving reference" />
                <datalist id="greige-lots">{data.lots.filter(lot => lot.balances.greige > 0).map(lot => <option key={lot._id} value={lot._id}>{lot.fabric} ({meters(lot.balances.greige)})</option>)}</datalist>
              </label>}
              {kind === 'return' && <>
                <label className="text-sm">Original dyeing dispatch number<input className={fields} name="jobId" list="dyeing-jobs" required maxLength={64} placeholder="e.g. DYE-20261112-001" />
                  <datalist id="dyeing-jobs">{data.jobs.map(job => <option key={job._id} value={job._id}>{job.processor} ({meters(job.outstandingUm)})</option>)}</datalist>
                </label>
                {['dyed', 'damaged', 'rejected', 'lost'].map(stage => <label key={stage} className="text-sm capitalize">{stage} length<input className={fields} name={stage} defaultValue="0" inputMode="decimal" required /></label>)}
                <label className="text-sm">Reason for loss, damage or rejection (required when reported)<input className={fields} name="reason" maxLength={500} required={exception} /></label>
              </>}
              <div className="sm:col-span-2"><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit">{saving ? 'Saving...' : 'Save warehouse document'}</button></div>
            </fieldset>
          </form>
        </section>}
        <section className="grid gap-4 xl:grid-cols-2">
          <div className={card}>
            <h2 className="text-lg font-semibold">Outstanding dyeing jobs</h2>
            {!data.jobs.length && <p className="text-sm text-slate-600">No outstanding jobs.</p>}
            <ul className="mt-2 divide-y divide-slate-100">{data.jobs.map(job => <li key={job._id} className="py-2 text-sm break-words"><strong>{job._id}</strong> / {job.processor} / Lot {job.lotId} / {meters(job.outstandingUm)} outstanding</li>)}</ul>
          </div>
          <div className={card}>
            <h2 className="text-lg font-semibold">Original fabric cost by stage</h2>
            <p className="text-xs text-slate-600">Valued at the original purchase rate and shown in the receipt currency.</p>
            <ul className="mt-2 divide-y divide-slate-100">{data.balances.filter(item => integralMongoDecimal(item.um) > BigInt(0)).map(item => <li key={item._id.stage + item._id.currency} className="flex justify-between gap-2 py-2 text-sm"><span className="capitalize">{item._id.stage} / {item._id.currency}</span><span>{item._id.currency === 'PKR' ? 'Rs ' + formatValuationPKR(item.valueNumerator) : formatValuationPKR(item.valueNumerator) + ' ' + item._id.currency}</span></li>)}</ul>
          </div>
        </section>
        <section className={card}>
          <h2 className="text-lg font-semibold">Fabric lots</h2>
          <ul className="mt-2 divide-y divide-slate-100">{data.lots.map(lot => <li key={lot._id} className="py-2 text-sm break-words"><strong>{lot._id}</strong> / {lot.fabric} / {lot.supplier}<p className="text-slate-600">{Object.entries(lot.balances).filter(([, um]) => um > 0).map(([stage, um]) => stage + ': ' + meters(um)).join(' / ')}</p></li>)}</ul>
        </section>
        <section className={card}>
          <h2 className="text-lg font-semibold">Fabric Movement History</h2>
          <p className="text-sm text-slate-600">Up to 100 recent posted challans, including completed jobs and losses.</p>
          {!data.events.length && <p className="text-sm text-slate-600">No warehouse movements yet.</p>}
          <ul className="mt-2 divide-y divide-slate-100">{data.events.map(movement => <li key={movement._id} className="py-2 text-sm break-words"><strong>{movement._id}</strong> / Lot {movement.lotId}{movement.jobId && ' / Job ' + movement.jobId}{movement.processor && ' / ' + movement.processor} <span className="text-green-800">· Posted</span>
            <p className="text-slate-600">{movement.legs.map(leg => leg.from + ' → ' + leg.to + ': ' + meters(leg.um)).join(' / ')}{movement.reason && ' / ' + movement.reason}</p>
            <time className="text-xs text-slate-500" dateTime={movement.postedAt}>{new Date(movement.postedAt).toLocaleString()}</time></li>)}</ul>
        </section>
      </>}
    </main>
  )
}
