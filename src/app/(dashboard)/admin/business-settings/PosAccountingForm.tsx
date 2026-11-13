'use client'

import { useEffect, useRef, useState } from 'react'
import type { PosApproval } from '@/lib/pos-accounting'

const labels = {
  cash: 'Cash on hand', bank: 'Bank clearing / deposits', receivables: 'Customer receivables',
  revenue: 'Textile sales revenue', finishedInventory: 'Finished inventory', cogs: 'Cost of goods sold',
}
type Data = { revision: number; approval: PosApproval | null; accounts: { _id: string; name: string; code?: string }[] }

export default function PosAccountingForm() {
  const [data, setData] = useState<Data>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  useEffect(() => {
    void fetch('/api/pos-accounting', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error()
      setData(await response.json())
    }).catch(() => setMessage('Could not load POS accounting.'))
  }, [])

  async function save(approval: PosApproval | null) {
    if (!data || lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/pos-accounting', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: data.revision, approval }),
      })
      const result = await response.json()
      if (!response.ok) { setMessage(result.error ?? 'Approval could not be saved.'); return }
      setData({ ...data, revision: result.revision, approval: result.approval })
      setMessage(approval ? 'POS accounting approved.' : 'New POS postings are blocked.')
    } catch {
      setMessage('Approval could not be confirmed. Reload to check before retrying.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return <section id="pos-accounting" className="mt-6 rounded-xl border bg-white p-6">
    <h2 className="text-xl font-semibold">Textile POS accounting approval</h2>
    <p className="my-2 text-sm">Approve only after the owner and accountant have verified the chart, historical receivables and capitalization of finished stock. This workflow supports PKR sales and collections without taxes, discounts or returns.</p>
    <p role="status">{message || (data ? data.approval ? 'Approved • Revision ' + data.revision : 'Posting blocked pending approval' : 'Loading accounting approval…')}</p>
    {data && <form key={data.revision} onSubmit={event => {
      event.preventDefault()
      const values = new FormData(event.currentTarget)
      void save({
        accounts: Object.fromEntries(Object.keys(labels).map(key => [key, String(values.get(key))])) as PosApproval['accounts'],
        businessApprovalReference: String(values.get('reference')), policy: 'raw-material-length-v1',
        capitalizedOrderIds: String(values.get('orders')).trim().split(/[\s,]+/).filter(Boolean),
        reconciledAndCapitalized: true, noTaxDiscountsOrReturns: true,
      })
    }}>
      <fieldset disabled={busy} className="my-3 grid gap-3 sm:grid-cols-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map(key => <label key={key} className="text-sm">{labels[key]}
          <select name={key} required className="block w-full rounded-lg border p-2" defaultValue={data.approval?.accounts[key] ?? ''}>
            <option value="">Choose an active GL account</option>
            {data.accounts.map(account => <option key={account._id} value={account._id}>{account.code ? account.code + ' · ' : ''}{account.name}</option>)}
          </select>
        </label>)}
        <label className="text-sm sm:col-span-2">Owner/accountant approval reference<input name="reference" minLength={3} maxLength={200} required className="block w-full rounded-lg border p-2" defaultValue={data.approval?.businessApprovalReference ?? ''} /></label>
        <label className="text-sm sm:col-span-2">Capitalized cutting order references (one per line)
          <textarea name="orders" maxLength={65000} className="block w-full rounded-lg border p-2" defaultValue={data.approval?.capitalizedOrderIds?.join('\n') ?? ''} />
        </label>
        <label className="text-sm sm:col-span-2"><input type="checkbox" required /> I confirm the receivables opening reconciliation and finished inventory capitalization at historical raw material cost by suit length.</label>
        <label className="text-sm sm:col-span-2"><input type="checkbox" required /> I confirm these transactions require no taxes, discounts or returns and that the owner has approved this policy.</label>
        <div className="flex flex-wrap gap-3 sm:col-span-2"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-white">Approve POS posting</button>
          {data.approval && <button type="button" className="rounded-lg border px-4 py-2" onClick={() => void save(null)}>Block new postings</button>}</div>
      </fieldset>
    </form>}
  </section>
}
