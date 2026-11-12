'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'

type Action = 'allocate' | 'complete' | 'grade' | 'regrade' | 'pack'
type Data = {
  canPost: boolean
  totals: { full: number; partial: number; nonstandard: number; packedSuits: number; unpacked: number; pending: number; quarantined: number }
  byGrade: Record<string, number>
  byLot: { lotId: string; um: string }[]
  configuration: { grades: { code: string; label: string }[]; thaan: { suitsPerThaan: number; metersPerSuit: number } }
  lots: { _id: string; fabric: string; balances: { dyed: number } }[]
  orders: { _id: string; lotId: string; allocatedUm: number; suitLengthUm: number; unclassified: number;
    grades: Record<string, { pending: number; packed: number }>
    completion?: { batchId: string; suitLengthUm: number; suits: number; quarantined: number; returnedUm: number; offcutsUm: number; wasteUm: number; consumedUm: number } }[]
  thaans: { _id: string; lotId: string; orderId: string; batchId: string; suits: number; defaultTargetSuits: number; totalUm: number;
    contents: { grade: string; label: string; suits: number }[] }[]
  events: { _id: string; orderId: string; lotId: string; revision: number; actor: string; postedAt: string; document: { reason?: string } }[]
}

const labels: Record<Action, string> = {
  allocate: 'Allocate cutting', complete: 'Complete cutting', grade: 'Grade suits',
  regrade: 'Correct grade', pack: 'Pack thaan',
}
const control = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const card = 'min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6'

function length(value: number | string) {
  const um = BigInt(value)
  const scale = BigInt(1000000)
  const fraction = (um % scale).toString().padStart(6, '0').replace(/0+$/, '')
  return (um / scale).toLocaleString() + (fraction ? '.' + fraction : '') + ' m'
}

export default function ProductionPage() {
  const [data, setData] = useState<Data | null>(null)
  const [action, setAction] = useState<Action>('allocate')
  const [orderId, setOrderId] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)

  async function refresh() {
    const response = await fetch('/api/textile-production', { cache: 'no-store' })
    if (!response.ok) throw new Error()
    setData(await response.json())
  }

  useEffect(() => { void refresh().catch(() => setNotice('Production data could not be loaded.')) }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const form = event.currentTarget
    const values = new FormData(form)
    const body: Record<string, unknown> = { kind: action }
    for (const [key, value] of values) {
      if (key === 'packGrade' || key === 'packSuits') continue
      if (['suitLength', 'actualSuitLength'].includes(key) && value === '') continue
      body[key] = ['suits', 'quarantined'].includes(key) ? Number(value) : value
    }
    if (action === 'pack') {
      body.contents = [{ grade: values.get('packGrade'), suits: Number(values.get('packSuits')) }]
    }
    inFlight.current = true
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch('/api/textile-production', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (response.status !== 200 && response.status !== 201) {
        if (response.status >= 400 && response.status < 500) {
          const result = await response.json().catch(() => null)
          setNotice(result?.error ?? 'Check the production document and retry.')
          return
        }
        throw new Error()
      }
      form.reset()
      setOrderId('')
      setNotice(response.status === 200 ? 'This document was already posted.' : 'Production document posted.')
      await refresh().catch(() => setNotice('Document posted successfully, but production data could not be refreshed.'))
    } catch {
      setNotice('Posting could not be confirmed. Retry with the same document reference and values.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const order = data?.orders.find(item => item._id === orderId.trim().toUpperCase())
  const availableGrades = Object.entries(order?.grades ?? {}).filter(([, stock]) => stock.pending > 0)

  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-4">
      <header className="rounded-2xl bg-slate-900 p-6 text-white">
        <Link href="/admin/warehouse" className="text-sm font-medium text-blue-200 underline">Warehouse</Link>
        <h1 className="mt-2 text-3xl font-semibold">Textile production</h1>
        <p className="mt-2 text-sm text-slate-300">Cut dyed lots, grade suits and pack individually traceable thaans.</p>
      </header>
      <p role="status" className="text-sm text-slate-700">{notice || (!data && 'Loading production...')}</p>
      {data && <>
        {data.canPost && <section className={card}>
          <h2 className="text-lg font-semibold">Production documents</h2>
          <div className="my-3 flex flex-wrap gap-2">
            {(Object.keys(labels) as Action[]).map(kind => <button key={kind} type="button" disabled={saving}
              aria-pressed={kind === action} onClick={() => { setAction(kind); setOrderId('') }}
              className={'rounded-lg border px-3 py-2 text-sm ' + (kind === action ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300')}>{labels[kind]}</button>)}
          </div>
          <form key={action} onSubmit={submit}>
            <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="text-sm">{action === 'pack' ? 'Thaan number' : 'Document reference'}
                <input className={control} name="reference" required maxLength={64} />
              </label>
              {action === 'allocate' ? <>
                <label className="text-sm">Dyed lot reference<input className={control} name="lotId" list="dyed-lots" required maxLength={64} /></label>
                <datalist id="dyed-lots">{data.lots.map(lot => <option key={lot._id} value={lot._id}>{lot.fabric} / {length(lot.balances.dyed)}</option>)}</datalist>
                <label className="text-sm">Allocation (meters)<input className={control} name="length" inputMode="decimal" required /></label>
                <label className="text-sm">Suit length (meters)<input className={control} name="suitLength" inputMode="decimal" placeholder={String(data.configuration.thaan.metersPerSuit)} /></label>
              </> : <>
                <label className="text-sm">Cutting order reference<input className={control} name="orderId" list="cutting-orders" required maxLength={64}
                  value={orderId} onChange={event => setOrderId(event.target.value)} /></label>
                <datalist id="cutting-orders">{data.orders.map(item => <option key={item._id} value={item._id}>{item.lotId}</option>)}</datalist>
              </>}
              {action === 'complete' && <>
                {order && <p className="text-sm text-slate-600 sm:col-span-2">Allocated {length(order.allocatedUm)} / {length(order.suitLengthUm)} planned per suit</p>}
                <label className="text-sm">Actual suit length (meters)<input className={control} name="actualSuitLength" inputMode="decimal" placeholder={order ? String(order.suitLengthUm / 1000000) : 'Planned length'} /></label>
                <label className="text-sm">Usable suits<input className={control} name="suits" type="number" min={0} defaultValue={0} required /></label>
                <label className="text-sm">Quarantined suits<input className={control} name="quarantined" type="number" min={0} defaultValue={0} required /></label>
                {[['returned', 'Uncut fabric returned'], ['offcuts', 'Usable offcuts'], ['waste', 'Cutting waste']].map(([name, label]) =>
                  <label key={name} className="text-sm">{label} (meters)<input className={control} name={name} defaultValue="0" inputMode="decimal" required /></label>)}
              </>}
              {(action === 'grade' || action === 'regrade') && <>
                {action === 'regrade' && <label className="text-sm">Original grade<input className={control} name="from" required /></label>}
                <label className="text-sm">Grade<select className={control} name="grade" required>
                  <option value="">Select an active grade</option>{data.configuration.grades.map(grade => <option key={grade.code} value={grade.code}>{grade.code} / {grade.label}</option>)}
                </select></label>
                <label className="text-sm">Suit count<input className={control} name="suits" type="number" min={1} required /></label>
                {action === 'regrade' && <label className="text-sm">Correction reason<input className={control} name="reason" maxLength={500} required /></label>}
              </>}
              {action === 'pack' && <>
                <p className="self-end text-sm text-slate-600">Standard thaan: {data.configuration.thaan.suitsPerThaan} suits of one grade.</p>
                <p className="self-end text-sm text-slate-600">Available: {availableGrades.map(([code, stock]) => code + ' / ' + stock.pending).join(', ') || 'enter a cutting order'}</p>
                <label className="text-sm">Packed grade<input className={control} name="packGrade" required /></label>
                <label className="text-sm">Packed suits<input className={control} name="packSuits" type="number" min={1} max={data.configuration.thaan.suitsPerThaan} required /></label>
              </>}
              <div className="sm:col-span-2"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">{saving ? 'Posting...' : 'Post document'}</button></div>
            </fieldset>
          </form>
        </section>}
        <section className={card}>
          <h2 className="text-lg font-semibold">Finished inventory</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[['Total thaans', data.totals.full + data.totals.partial + data.totals.nonstandard], ['Full thaans', data.totals.full], ['Partial thaans', data.totals.partial], ['Oversize thaans', data.totals.nonstandard],
              ['Packed suits', data.totals.packedSuits], ['Unpacked graded suits', data.totals.unpacked], ['Pending grading', data.totals.pending],
              ['Quarantined suits', data.totals.quarantined]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-600">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}
          </dl>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><h3 className="text-sm font-semibold">Available suits by grade</h3><p className="text-sm">{Object.entries(data.byGrade).map(([code, count]) => code + ' / ' + count).join(' · ') || 'No packed suits'}</p></div>
            <div><h3 className="text-sm font-semibold">Packed length by lot</h3><ul className="text-sm">{data.byLot.map(lot => <li key={lot.lotId}>{lot.lotId} / {length(lot.um)}</li>)}</ul></div>
          </div>
          <ul className="mt-4 divide-y divide-slate-100">{data.thaans.map(thaan => <li key={thaan._id} className="break-words py-2 text-sm">
            <strong>{thaan._id}</strong> / {thaan.suits === thaan.defaultTargetSuits ? 'Full' : thaan.suits < thaan.defaultTargetSuits ? 'Partial' : 'Oversize'} / {thaan.suits} suits / {length(thaan.totalUm)}
            <p className="text-slate-600">Lot {thaan.lotId} / Order {thaan.orderId} / Batch {thaan.batchId} / {thaan.contents.map(item => item.grade + ' (' + item.label + '): ' + item.suits).join(', ')}</p>
          </li>)}</ul>
        </section>
        <section className={card}>
          <h2 className="text-lg font-semibold">Cutting orders</h2>
          <ul className="mt-2 divide-y divide-slate-100">{data.orders.map(item => <li key={item._id} className="break-words py-2 text-sm">
            <strong>{item._id}</strong> / Lot {item.lotId} / {length(item.allocatedUm)} / {item.completion ? 'Completed' : 'Work in progress'}
            {item.completion && <p className="text-slate-600">{item.completion.suits} usable suits at {length(item.completion.suitLengthUm)} each / {item.unclassified} pending grading / {item.completion.quarantined} quarantined / {length(item.completion.consumedUm)} consumed / {length(item.completion.returnedUm)} returned / {length(item.completion.offcutsUm)} usable offcuts / {length(item.completion.wasteUm)} waste</p>}
          </li>)}</ul>
        </section>
        <section className={card}>
          <h2 className="text-lg font-semibold">Recent movements</h2>
          <ul className="mt-2 divide-y divide-slate-100">{data.events.map(event => <li key={event._id} className="break-words py-2 text-sm">
            <strong>{event._id}</strong> / Order {event.orderId} / Lot {event.lotId} / Revision {event.revision}
            <p className="text-slate-600">{event.actor} / {new Date(event.postedAt).toLocaleString()}{event.document.reason && ' / ' + event.document.reason}</p>
          </li>)}</ul>
        </section>
      </>}
    </main>
  )
}
