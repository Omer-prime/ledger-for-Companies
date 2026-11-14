'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { stockRow } from '@/lib/opening-stock'
import type { z } from 'zod'
import { formatMicrometers } from '@/lib/warehouse-values'

const columns='identifier,kind,fabric,design,size,grade,suits,meters,costPkr,sellingPricePkr,source,evidence'
function cells(line:string) {
  const result:string[]=[]
  let index=0
  while(index<=line.length){
    const match=/^(?:"((?:[^"]|"")*)"|([^",]*))(,|$)/.exec(line.slice(index))
    if(!match) throw new Error('Invalid CSV quoting')
    result.push((match[1]?.replaceAll('""','"')??match[2]).trim())
    index+=match[0].length
    if(!match[3]) break
  }
  return result
}
function exact(value:string, places:number) {
  if(!new RegExp('^\\d+(?:\\.\\d{1,'+places+'})?$').test(value)) return NaN
  const [whole,fraction='']=value.split('.')
  return Number(whole+fraction.padEnd(places,'0'))
}
type Batch={_id:string;countDate:string;verified?:{reference:string};approved:boolean}
type Row=z.infer<typeof stockRow>
type Import={action:'import';reference:string;countDate:string;rows:Row[];preview:boolean}
const input='block w-full rounded border p-2'
const pkr=(value?:number)=>value===undefined?'Not entered':(value/100).toLocaleString('en-PK',{minimumFractionDigits:2})
const suggested=(prefix:string)=>prefix+'-'+crypto.randomUUID().slice(0,12).toUpperCase()
const primary='rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50'
export default function OpeningStockForm({countDate,standard,grades}: {countDate:string;standard:number;grades:{code:string;label:string}[]}) {
  const [csv,setCsv]=useState(columns+'\n')
  const [batches,setBatches]=useState<Batch[]>([])
  const [message,setMessage]=useState('')
  const [preview,setPreview]=useState<Import|null>(null)
  const [mode,setMode]=useState<'single'|'csv'>('single')
  const [kind,setKind]=useState('full')
  const [batchRef,setBatchRef]=useState('')
  const [identifier,setIdentifier]=useState('')
  const [draft,setDraft]=useState<Row[]>([])
  const [editId,setEditId]=useState<string>()
  const [editing,setEditing]=useState<Row>()
  const [count,setCount]=useState('')
  const [meters,setMeters]=useState('')
  const [cost,setCost]=useState('')
  const [formRevision,setFormRevision]=useState(0)
  const [uncertain,setUncertain]=useState<Import|null>(null)
  const [saved,setSaved]=useState('')
  const [busy,setBusy]=useState(false)
  const lock=useRef(false)
  async function refresh(){
    const response=await fetch('/api/opening-stock',{cache:'no-store'})
    if(!response.ok) throw new Error('Could not load opening batches')
    setBatches(await response.json())
  }
  useEffect(()=>{
    setBatchRef(suggested('OPEN'));setIdentifier(suggested('STOCK'))
    void refresh().catch(()=>setMessage('Could not load opening batches'))
  },[])
  async function send(body:Record<string,unknown>) {
    if(lock.current) return
    lock.current=true
    setBusy(true)
    try {
      const response=await fetch('/api/opening-stock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      if(response.status>=500) throw new Error('Confirmation unavailable')
      const result=await response.json()
      if(!response.ok) {setMessage(result.errors?.map((row:{row:number;error:string})=>'Row '+row.row+': '+row.error).join('\n')??result.error??'Could not save');return}
      if(body.preview) {setPreview({...body,preview:false} as Import);setMessage('Review the validated items below before saving.');return}
      setPreview(null)
      setUncertain(null)
      if(body.action==='import') {
        setSaved(String(body.reference));setDraft([]);setEditing(undefined);setEditId(undefined)
        setBatchRef(suggested('OPEN'));setIdentifier(suggested('STOCK'));setCount('');setMeters('');setCost('');setFormRevision(value=>value+1)
      }
      setMessage(result.replayed?'Already saved. No duplicate was created.':body.action==='verify'?'Count and cost verified. Accountant approval is still required.':'Batch saved. Verify the count and cost next.')
      await refresh().catch(()=>setMessage('Saved, but the batch list could not refresh. Reload to check.'))
    } catch {
      if(body.action==='import'&&!body.preview) setUncertain(body as Import)
      setMessage('Confirmation lost. Retry using the same reference and values.')
    }
    finally {lock.current=false;setBusy(false)}
  }
  return <>
    <nav aria-label="Opening stock stages" className="grid gap-2 text-sm sm:grid-cols-3">{[['add','1. Add and review stock'],['verify','2. Verify count and cost'],['approve','3. Reconcile and approve']].map(([id,label])=><a key={id} href={'#'+id} className="rounded-xl border bg-white p-3 font-semibold text-blue-800">{label}</a>)}</nav>
    <div id="add" className="flex gap-2">{(['single','csv'] as const).map(option=><button key={option} type="button" disabled={busy||!!uncertain||draft.length>0} aria-pressed={mode===option} className="rounded border px-4 py-2 aria-pressed:bg-blue-800 aria-pressed:text-white" onClick={()=>{setMode(option);setPreview(null)}}>{option==='single'?'Add one item':'Import CSV'}</button>)}</div>
    <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onChange={()=>setPreview(null)} onSubmit={event=>{
      event.preventDefault()
      const form=new FormData(event.currentTarget)
      try {
        if(mode==='single') {
          const value=(key:string)=>String(form.get(key)??'')
          const row=stockRow.safeParse({identifier:value('identifier'),kind,fabric:value('fabric'),design:value('design'),size:value('size'),grade:value('grade'),
            suits:kind==='loose'?1:kind==='full'?standard:Number(value('suits')),suitLengthUm:exact(value('meters'),6),
            costPaisa:value('cost')?exact(value('cost'),2):undefined,sellingPricePaisa:value('price')?exact(value('price'),2):undefined,
            source:value('source'),evidence:value('evidence')})
          if(!row.success) throw new Error(row.error.issues.map(issue=>issue.path.join('.')+': '+issue.message).join('; '))
          if(kind==='partial'&&row.data.suits>=standard) throw new Error('Partial thaans must contain fewer than '+standard+' suits.')
          if(draft.some(item=>item.identifier===row.data.identifier&&item.identifier!==editId)) throw new Error('This stock identifier is already staged.')
          if(draft.length>=100&&!editId) throw new Error('A batch can contain at most 100 items.')
          const rows=editId?draft.map(item=>item.identifier===editId?row.data:item):[...draft,row.data]
          setDraft(rows);setEditId(undefined);setEditing(undefined);setIdentifier(suggested('STOCK'));setCount('');setMeters('');setCost('');setFormRevision(value=>value+1)
          setMessage('Item staged. Add another item or preview the batch.')
          return
        }
        const [header,...lines]=csv.trim().split(/\r?\n/)
        if(header.replace(/^\uFEFF/,'')!==columns) throw new Error('Keep the example column headings and order.')
        const rows=lines.map((line,i)=>{
          try {
            const [identifier,kind,fabric,design,size,grade,suits,meters,cost,price,source,evidence,...rest]=cells(line)
            if(rest.length||evidence===undefined) throw new Error('Expected 12 columns')
            const row=stockRow.safeParse({identifier,kind,fabric,design,size,grade,suits:Number(suits),suitLengthUm:exact(meters,6),costPaisa:cost?exact(cost,2):undefined,sellingPricePaisa:price?exact(price,2):undefined,source,evidence})
            if(!row.success) throw new Error(row.error.issues.map(issue=>issue.path.join('.')+': '+issue.message).join('; '))
            return row.data
          } catch(error){throw new Error('CSV line '+(i+2)+': '+(error instanceof Error?error.message:'Invalid row'))}
        })
        void send({action:'import',reference:form.get('reference'),countDate:form.get('countDate'),rows,preview:true})
      } catch(error){setMessage(error instanceof Error?error.message:'Invalid CSV')}
    }}>
      <h2 className="font-semibold">1. Count and preview</h2>
      <p className="text-sm">Enter the total historical cost in PKR for the item, or leave it blank until verified. Selling price is optional and separate from cost.</p>
      <fieldset disabled={busy||!!uncertain} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2"><label className="block">Batch reference <input name="reference" required className={input} maxLength={64} value={batchRef} onChange={event=>setBatchRef(event.target.value)}/><small>One reference for this entire physical count.</small></label>
      <label className="block">Physical count date <input type="date" name="countDate" defaultValue={countDate} required className={input}/></label></div>
      {mode==='single'?<div key={formRevision} className="grid gap-3 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Stock details</h3>
        <label>Stock identifier <input name="identifier" required maxLength={64} className={input} value={identifier} onChange={event=>setIdentifier(event.target.value)}/><small>Unique barcode ID for this thaan or suit.</small></label>
        <label>Item type <select className={input} value={kind} onChange={event=>setKind(event.target.value)}><option value="full">Full thaan</option><option value="partial">Partial thaan</option><option value="loose">Loose suit</option></select></label>
        <label>Fabric <input name="fabric" defaultValue={editing?.fabric} required maxLength={120} className={input}/></label>
        <label>Grade <select name="grade" required className={input} defaultValue={editing?.grade??''}><option value="">Choose an active grade</option>{grades.map(grade=><option key={grade.code} value={grade.code}>{grade.code} · {grade.label}</option>)}</select></label>
        <label>Color or design <input name="design" defaultValue={editing?.design} maxLength={120} className={input}/></label>
        <label>Size <input name="size" defaultValue={editing?.size} maxLength={60} className={input}/></label>
        <h3 className="font-semibold sm:col-span-2">Quantity</h3>
        {kind==='partial'?<label>Suit count <input name="suits" type="number" min={1} max={standard-1} required className={input} value={count} onChange={event=>setCount(event.target.value)}/></label>:<p className="self-center">{kind==='loose'?'1 suit':'Standard full thaan: '+standard+' suits'}</p>}
        <label>Length per suit (m) <input name="meters" inputMode="decimal" required className={input} value={meters} onChange={event=>setMeters(event.target.value)}/></label>
        <p className="text-sm text-slate-600">Total length: {Number.isSafeInteger(exact(meters,6)*(kind==='full'?standard:kind==='loose'?1:Number(count)))?formatMicrometers(exact(meters,6)*(kind==='full'?standard:kind==='loose'?1:Number(count)))+' m':'—'}</p>
        <h3 className="font-semibold sm:col-span-2">Cost</h3>
        <label>Total historical cost (PKR) <input name="cost" inputMode="decimal" className={input} value={cost} onChange={event=>setCost(event.target.value)}/><small>Cost of the entire item. Per suit: {Number.isFinite(exact(cost,2)/(kind==='full'?standard:kind==='loose'?1:Number(count)))?pkr(Math.round(exact(cost,2)/(kind==='full'?standard:kind==='loose'?1:Number(count)))):'—'}</small></label>
        <label>Optional selling price (PKR) <input name="price" inputMode="decimal" className={input} defaultValue={editing?.sellingPricePaisa===undefined?'':editing.sellingPricePaisa/100}/><small>Reference only; does not set the POS price.</small></label>
        <h3 className="font-semibold sm:col-span-2">Evidence</h3>
        <label>Source description <input name="source" defaultValue={editing?.source} required maxLength={200} className={input}/></label>
        <label>Evidence reference <input name="evidence" defaultValue={editing?.evidence} maxLength={200} className={input}/></label>
      </div>:<>
      <label className="block">Load CSV file <input type="file" accept=".csv,text/csv" onChange={event=>{const file=event.target.files?.[0];if(file&&file.size<=250000) void file.text().then(value=>{setCsv(value);setPreview(null)}).catch(()=>setMessage('Could not read CSV'));else if(file) setMessage('CSV exceeds 250 KB')}} /></label>
      <label className="block">CSV rows<textarea className="block w-full rounded border p-2 font-mono text-sm" rows={7} value={csv} onChange={event=>setCsv(event.target.value)} /></label>
      </>}
      <button className={primary}>{mode==='single'?(editId?'Update staged item':'Stage item'):'Preview import'}</button>
      {mode==='single'&&draft.length>0&&<button type="button" className="ml-2 rounded border px-4 py-2" disabled={!!editId} onClick={event=>{
        const form=new FormData(event.currentTarget.form!)
        void send({action:'import',reference:form.get('reference'),countDate:form.get('countDate'),rows:draft,preview:true})
      }}>Preview batch</button>}
      </fieldset>
    </form>
    {(preview||draft.length>0)&&<section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold">{preview?'Review '+preview.reference+' · '+preview.countDate:'Staged items'}</h2>
      <div className="my-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{['Stock ID','Type','Fabric','Grade','Suits','Meters per suit','Total meters','Historical cost (PKR)','Selling price (PKR)',...(mode==='single'?['Actions']:[])].map(label=><th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{(preview?.rows??draft).map(row=><tr className="border-t" key={row.identifier}>
          {[row.identifier,row.kind,row.fabric,row.grade,row.suits,formatMicrometers(row.suitLengthUm),formatMicrometers(row.suitLengthUm*row.suits),pkr(row.costPaisa),pkr(row.sellingPricePaisa)].map((value,index)=><td className="p-2" key={index}>{value}</td>)}
          {mode==='single'&&<td className="p-2"><button type="button" className="underline" disabled={busy||!!uncertain} onClick={()=>{
            setPreview(null);setEditing(row);setEditId(row.identifier);setIdentifier(row.identifier);setKind(row.kind);setCount(String(row.suits));setMeters(String(row.suitLengthUm/1e6));setCost(row.costPaisa===undefined?'':String(row.costPaisa/100));setFormRevision(value=>value+1)
            document.getElementById('add')?.scrollIntoView()
          }}>Edit {row.identifier}</button> <button type="button" className="underline" disabled={busy||!!uncertain} onClick={()=>{setPreview(null);setDraft(rows=>rows.filter(item=>item.identifier!==row.identifier));if(editId===row.identifier){setEditId(undefined);setEditing(undefined);setIdentifier(suggested('STOCK'));setCount('');setMeters('');setCost('');setFormRevision(value=>value+1)}}}>Remove</button></td>}
        </tr>)}</tbody>
      </table></div>
      {preview&&<button type="button" disabled={busy} onClick={()=>void send(uncertain??preview)} className={primary}>{uncertain?'Retry same batch':mode==='single'?'Confirm batch':'Confirm import'}</button>}
    </section>}
    <p role="status" className="whitespace-pre-wrap">{message}</p>
    {saved&&<a href="#verify" className="inline-block rounded-lg bg-blue-50 px-4 py-2 font-semibold text-blue-800">Next: verify {saved}</a>}
    <section id="verify" className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold">2. Verify count and cost</h2>
      {batches.map(batch=><div key={batch._id} className="space-y-2 border-b py-3"><p><strong>{batch._id}</strong> · {batch.countDate} · {batch.approved?'Approved for Sale':batch.verified?'Count and Cost Verified':'Pending Verification'}</p>
        {batch.verified&&!batch.approved&&<Link href="/admin/financial-setup" className="text-blue-800 underline">Next: reconcile and approve</Link>}
        {!batch.verified&&<form className="space-y-2" onSubmit={event=>{
          event.preventDefault()
          const data=new FormData(event.currentTarget)
          const costs=String(data.get('costs')).trim().split(/\r?\n/).filter(Boolean).map(line=>{
            const [identifier,pk]=line.split(',')
            return {identifier,costPaisa:exact(pk??'',2)}
          })
          void send({action:'verify',reference:batch._id,verificationReference:data.get('evidence'),costs})
        }}>
          <label className="block">Count and cost evidence <input name="evidence" required minLength={3} maxLength={200} className="rounded border p-2"/></label>
          <label className="block">Missing or corrected costs (identifier,total PKR per line)<textarea name="costs" className="block w-full rounded border p-2" /></label>
          <button disabled={busy} className="rounded border px-4 py-2">Verify physical count and historical costs</button>
        </form>}
      </div>)}
    </section>
    <section id="approve" className="rounded-xl border bg-white p-5"><h2 className="font-semibold">3. Reconcile and approve</h2><p className="text-sm">Have the accountant match this batch to the existing GL inventory balance before approving it. This screen does not post an opening journal.</p><Link className="text-blue-800 underline" href="/admin/financial-setup">Open Financial Setup</Link></section>
  </>
}
