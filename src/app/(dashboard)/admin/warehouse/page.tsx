'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

type Kind = 'receipt' | 'dispatch' | 'return'
type Data = {
  balances: { _id: { stage: string; currency: string }; um: string; valueNumerator: string }[]
  lots: { _id: string; fabric: string; supplier: string; balances: Record<string, number> }[]
  jobs: { _id: string; lotId: string; processor: string; outstandingUm: number }[]
  events: { _id: string; lotId: string; jobId?: string; postedAt: string; reason?: string; legs: { to: string; um: number }[] }[]
  accounts: { _id: string; name: string }[]
  outstandingJobs: number
  canPost: boolean
}

function decimalMicros(value: number | string | bigint) {
  const units = BigInt(value)
  const scale = BigInt(1000000)
  const fractional = (units % scale).toString().padStart(6, '0').replace(/0+$/, '')
  return (units / scale).toLocaleString() + (fractional ? '.' + fractional : '')
}

const meters = (um: number | string | bigint) => decimalMicros(um) + ' m'
const actions: Record<Kind, string> = { receipt: 'Receive greige', dispatch: 'Dispatch to dyeing', return: 'Record dyeing return' }
const fields = 'block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const card = 'min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6'

export default function WarehousePage() {
  const [data, setData] = useState<Data | null>(null)
  const [kind, setKind] = useState<Kind>('receipt')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
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
    const body = { ...values, kind, ...(kind === 'receipt' ? { minorPerMeter: Number(values.minorPerMeter) } : {}) }
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
      setNotice(response.status === 200 ? 'This document was already posted.' : 'Warehouse document posted.')
      await refresh().catch(() => {
        setNotice('Document posted successfully, but warehouse data could not be refreshed.')
      })
    } catch {
      setNotice('Posting could not be confirmed. Retry with the same document reference and values.')
    } finally {
      lock.current = false
      setSaving(false)
    }
  }

  function total(stage: string) {
    return data?.balances.filter(item => item._id.stage === stage).reduce((sum, item) => sum + BigInt(item.um), BigInt(0)) ?? BigInt(0)
  }

  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-4">
      <header className="rounded-2xl bg-slate-900 p-6 text-white">
        <p className="text-xs font-semibold tracking-widest text-blue-200 uppercase">OarLinks / Operations</p>
        <h1 className="mt-2 text-3xl font-semibold">Warehouse</h1>
        <p className="mt-2 text-sm text-slate-300">Trace greige lots from supplier receipt through dyeing and return.</p>
      </header>
      <p role="status" className="text-sm text-slate-700">{notice || (!data && 'Loading warehouse...')}</p>
      {data && <>
        <section aria-label="Warehouse totals" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[['Greige available', meters(total('greige'))], ['With processors', meters(total('processor'))],
            ['Dyed returned', meters(total('dyed'))], ['Outstanding jobs', String(data.outstandingJobs)]].map(([label, value]) => (
            <div key={label} className={card}><p className="text-xs text-slate-600">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>
          ))}
        </section>
        {data.canPost && <section className={card}>
          <h2 className="text-lg font-semibold">Post a warehouse document</h2>
          <div className="my-3 flex flex-wrap gap-2">
            {(Object.keys(actions) as Kind[]).map(action => (
              <button key={action} type="button" aria-pressed={kind === action} disabled={saving} onClick={() => setKind(action)}
                className={'rounded-lg border px-3 py-2 text-sm ' + (kind === action ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300')}>{actions[action]}</button>
            ))}
          </div>
          <form key={kind} onSubmit={post}>
            <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Document reference<input className={fields} name="reference" maxLength={64} required /></label>
              <label className="text-sm">Length unit<select className={fields} name="unit"><option value="m">Meters</option><option value="yd">Yards</option></select></label>
              {kind !== 'return' && <>
                <label className="text-sm">{kind === 'receipt' ? 'Supplier' : 'Dyeing processor'}
                  <select className={fields} name={kind === 'receipt' ? 'supplierId' : 'processorId'} required>
                    <option value="">Select an account</option>{data.accounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}
                  </select>
                </label>
                <label className="text-sm">Length<input className={fields} name="quantity" inputMode="decimal" required /></label>
              </>}
              {kind === 'receipt' && <>
                <label className="text-sm">Fabric description<input className={fields} name="fabric" maxLength={500} required /></label>
                <label className="text-sm">Cost per meter (currency minor units)<input className={fields} name="minorPerMeter" type="number" min={0} max={1e9} required /></label>
              </>}
              {kind === 'dispatch' && <label className="text-sm">Greige lot reference<input className={fields} name="lotId" list="greige-lots" required maxLength={64} />
                <datalist id="greige-lots">{data.lots.filter(lot => lot.balances.greige > 0).map(lot => <option key={lot._id} value={lot._id}>{lot.fabric} ({meters(lot.balances.greige)})</option>)}</datalist>
              </label>}
              {kind === 'return' && <>
                <label className="text-sm">Dyeing job reference<input className={fields} name="jobId" list="dyeing-jobs" required maxLength={64} />
                  <datalist id="dyeing-jobs">{data.jobs.map(job => <option key={job._id} value={job._id}>{job.processor} ({meters(job.outstandingUm)})</option>)}</datalist>
                </label>
                {['dyed', 'damaged', 'rejected', 'lost'].map(stage => <label key={stage} className="text-sm capitalize">{stage} length<input className={fields} name={stage} defaultValue="0" inputMode="decimal" required /></label>)}
                <label className="text-sm">Reason for loss, damage or rejection<input className={fields} name="reason" maxLength={500} /></label>
              </>}
              <div className="sm:col-span-2"><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" type="submit">{saving ? 'Posting...' : 'Post document'}</button></div>
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
            <h2 className="text-lg font-semibold">Stage valuation</h2>
            <p className="text-xs text-slate-600">Receipt cost allocation, shown in currency minor units.</p>
            <ul className="mt-2 divide-y divide-slate-100">{data.balances.filter(item => Number(item.um) > 0).map(item => <li key={item._id.stage + item._id.currency} className="flex justify-between gap-2 py-2 text-sm"><span className="capitalize">{item._id.stage} / {item._id.currency}</span><span>{decimalMicros(item.valueNumerator)}</span></li>)}</ul>
          </div>
        </section>
        <section className={card}>
          <h2 className="text-lg font-semibold">Fabric lots</h2>
          <ul className="mt-2 divide-y divide-slate-100">{data.lots.map(lot => <li key={lot._id} className="py-2 text-sm break-words"><strong>{lot._id}</strong> / {lot.fabric} / {lot.supplier}<p className="text-slate-600">{Object.entries(lot.balances).filter(([, um]) => um > 0).map(([stage, um]) => stage + ': ' + meters(um)).join(' / ')}</p></li>)}</ul>
        </section>
        <section className={card}>
          <h2 className="text-lg font-semibold">Recent activity and material exceptions</h2>
          {!data.events.length && <p className="text-sm text-slate-600">No warehouse movements yet.</p>}
          <ul className="mt-2 divide-y divide-slate-100">{data.events.map(movement => <li key={movement._id} className="py-2 text-sm break-words"><strong>{movement._id}</strong> / Lot {movement.lotId}{movement.jobId && ' / Job ' + movement.jobId}
            <p className="text-slate-600">{movement.legs.map(leg => leg.to + ': ' + meters(leg.um)).join(' / ')}{movement.reason && ' / ' + movement.reason}</p>
            <time className="text-xs text-slate-500" dateTime={movement.postedAt}>{new Date(movement.postedAt).toLocaleString()}</time></li>)}</ul>
        </section>
      </>}
    </main>
  )
}
