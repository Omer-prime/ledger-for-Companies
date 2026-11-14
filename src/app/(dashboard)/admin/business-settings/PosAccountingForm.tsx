'use client'

import { useEffect, useRef, useState } from 'react'
import type { PosApproval } from '@/lib/pos-accounting'

const labels = {
  cash: 'Cash on hand', bank: 'Bank clearing / deposits', receivables: 'Customer receivables',
  revenue: 'Textile sales revenue', finishedInventory: 'Finished inventory', cogs: 'Cost of goods sold',
}
const explanations={cash:'Money collected at the counter.',bank:'Card or bank payments received.',receivables:'Udhar customers still owe.',revenue:'Income from textile sales.',finishedInventory:'The carrying value of finished stock.',cogs:'The cost of stock when sold.'}
type Data = { revision: number; approval: PosApproval | null; accounts: { _id: string; name: string; code?: string; meta?: {posRole?:string} }[] }

export default function PosAccountingForm({guided=false}: {guided?:boolean}) {
  const [data, setData] = useState<Data>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm,setConfirm]=useState(false)
  const lock = useRef(false)
  const [created,setCreated]=useState<Partial<PosApproval['accounts']>>({})
  async function create(role:keyof typeof labels) {
    if(!data||lock.current) return
    lock.current=true
    setBusy(true)
    try {
      const response=await fetch('/api/pos-accounting',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,name:labels[role]})})
      const account=await response.json()
      if(!response.ok) {setMessage(account.error??'Account could not be created');return}
      setData({...data,accounts:[...data.accounts.filter(row=>row._id!==account._id),account]})
      setCreated(current=>({...current,[role]:account._id}))
      setMessage(account.name+' is available to select. Approval has not changed.')
    } catch {setMessage('Account creation not confirmed. Retry the same role.')}
    finally {lock.current=false;setBusy(false)}
  }
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
      setConfirm(false)
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
    {data&&<p className="my-2 text-sm text-slate-600">{data.approval?'Receivables reconciliation attested in the current approval. '+(data.approval.capitalizedOpeningIds?.length??0)+' opening batches approved.':'Opening receivables and inventory reconciliation have not been attested.'} Creating an account posts no journal and does not approve POS. If counted stock is missing from the GL, have the accountant post and reconcile a separate opening journal before approving it here.</p>}
    {guided && data && <div className="my-3 flex flex-wrap gap-2">
      {(Object.keys(labels) as (keyof typeof labels)[]).filter(role=>!data.approval?.accounts[role]&&!data.accounts.some(account=>account.meta?.posRole===role)).map(role=>
        <button type="button" disabled={busy} key={role} className="rounded border px-3 py-2" onClick={()=>void create(role)}>Create {labels[role]}</button>)}
    </div>}
    {data && <form key={data.revision} onSubmit={event => {
      event.preventDefault()
      if(!confirm){setConfirm(true);return}
      const values = new FormData(event.currentTarget)
      void save({
        accounts: Object.fromEntries(Object.keys(labels).map(key => [key, String(values.get(key))])) as PosApproval['accounts'],
        businessApprovalReference: String(values.get('reference')), policy: 'raw-material-length-v1',
        capitalizedOrderIds: String(values.get('orders')).trim().split(/[\s,]+/).filter(Boolean),
        capitalizedOpeningIds: String(values.get('opening')).trim().split(/[\s,]+/).filter(Boolean),
        reconciledAndCapitalized: true, noTaxDiscountsOrReturns: true,
      })
    }}>
      <fieldset disabled={busy} className="my-3 grid gap-3 sm:grid-cols-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map(key => <label key={key} className="text-sm">{labels[key]}
          <select name={key} required className="block w-full rounded-lg border p-2" key={created[key]??key} defaultValue={data.approval?.accounts[key] ?? created[key] ?? ''}>
            <option value="">Choose an active GL account</option>
            {data.accounts.filter(account=>!account.meta?.posRole||account.meta.posRole===key).map(account => <option key={account._id} value={account._id}>{account.code ? account.code + ' · ' : ''}{account.name}</option>)}
          </select>
          <span className="block text-slate-600">{explanations[key]} {data.approval?.accounts[key]?'Approved mapping':data.accounts.some(account=>account.meta?.posRole===key)?'Guided account exists; mapping pending':'Choose or create a GL account.'}</span>
        </label>)}
        {confirm&&<>
        <label className="text-sm sm:col-span-2">Owner/accountant approval reference<input name="reference" minLength={3} maxLength={200} required className="block w-full rounded-lg border p-2" defaultValue={data.approval?.businessApprovalReference ?? ''} /></label>
        <label className="text-sm sm:col-span-2">Capitalized cutting order references (one per line)
          <textarea name="orders" maxLength={65000} className="block w-full rounded-lg border p-2" defaultValue={data.approval?.capitalizedOrderIds?.join('\n') ?? ''} />
        </label>
        <label className="text-sm sm:col-span-2">Verified opening batches already in GL inventory (one per line)
          <textarea name="opening" className="block w-full rounded-lg border p-2" defaultValue={data.approval?.capitalizedOpeningIds?.join('\n') ?? ''} />
        </label>
        <label className="text-sm sm:col-span-2"><input type="checkbox" required /> I confirm the receivables opening reconciliation and finished inventory capitalization at historical raw material cost by suit length.</label>
        <label className="text-sm sm:col-span-2"><input type="checkbox" required /> I confirm these transactions require no taxes, discounts or returns and that the owner has approved this policy.</label>
        </>}
        <div className="flex flex-wrap gap-3 sm:col-span-2"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-white">{confirm?'Approve POS posting':'Review and confirm approval'}</button>
          {data.approval && <button type="button" className="rounded-lg border px-4 py-2" onClick={() => void save(null)}>Block new postings</button>}</div>
      </fieldset>
    </form>}
  </section>
}
