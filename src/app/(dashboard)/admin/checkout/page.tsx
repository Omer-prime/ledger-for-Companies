'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatMicrometers } from '@/lib/warehouse-values'
import { code128Bars, code128Width } from '@/lib/code128'

type Item = { id:string; grade:string; suits:number; totalUm:number; fabric?:string; openingKind?:string }
type Doc = { _id:string;kind:'sale'|'payment';reference:string;partyId?:string;partyName:string;walkIn?:boolean;
  date:string;actor:string;postedAt:string;total:number;paid:number;method?:'cash'|'bank';items:Item[] }
type Receipt = { _id:string;reference:string;partyName:string;amount:number;method:'cash'|'bank';kind:string;date:string }
type Totals = {saleTotal:number;sales:number;walkInSales:number;paidAtSale:number;paymentsAgainstDue:number;
  newUdhar:number;cashReceived:number;bankReceived:number}
type Data = {accountingApproved:boolean;parties:{id:string;name:string}[];thaans:Item[];recent:Doc[];dailyDocuments:Doc[];
  receipts:Receipt[];businessName:string;businessDay:string;volume:{suitsSold:number;soldUm:string;fullThaans:number};customerHistory:Doc[];day:string;dailyCount:number;totals:Totals;due:number|null}
const input = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const money = (value:number) => 'Rs '+Number(value).toLocaleString('en-PK')
const escapes:Record<string,string> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}
const esc=(value:string)=>String(value).replace(/[&<>"']/g, match=>escapes[match]??match)
const paperSizes:Record<string,string>={a4:'A4 portrait',a5:'A5 portrait',thermal:'80mm 200mm',sticker:'50mm 30mm'}

function printHtml(html:string,paper:string,title:string) {
  const w=window.open('','_blank','width=850,height=740')
  if(!w) { window.alert('Allow pop-ups for this localhost site to print.');return }
  // Browser print confirmation is deliberate. Silent printing requires a separately secured shop kiosk.
  const layout=paperSizes[paper]??paperSizes.a4
  const margin=paper==='sticker'?'1mm':paper==='thermal'?'3mm':'8mm'
  const font=paper==='sticker'?'8px':paper==='thermal'?'10px':'12px'
  w.opener=null
  w.document.open()
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${layout};margin:${margin}}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#111;font-size:${font}}h1{font-size:16px;margin:0 0 6px}h2{font-size:13px;margin:12px 0 5px}p{margin:5px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{overflow-wrap:anywhere}td,th{border-bottom:1px solid #bbb;padding:4px 2px;text-align:left;vertical-align:top}th{font-weight:bold}.right{text-align:right}.small{font-size:10px}.muted{color:#555}@media screen{body{max-width:780px;margin:12px auto;padding:12px;border:1px solid #ddd}}</style></head><body>${html}</body></html>`)
  w.document.close()
  w.focus()
  w.print()
}
function barcodeSvg(value:string){
  const bars=code128Bars(value)
  const width=code128Width(value)
  return `<svg viewBox="0 0 ${width+22} 58" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:45px;background:white"><rect width="100%" height="100%" fill="white"/>${bars.map(b=>`<rect x="${b.x+11}" y="1" width="${b.width}" height="46" fill="black"/>`).join('')}</svg>`
}
function receiptHtml(d:Doc,businessName:string){
  const due=d.kind==='sale'?d.total-d.paid:0
  const details=d.items.map(i=>`<tr><td>${esc(i.id)}${i.fabric ? "<br>"+esc(i.fabric) : ""}</td><td>${esc(i.grade)}</td><td class="right">${i.suits}</td><td class="right">${(i.totalUm/1e6).toLocaleString('en-PK')} m</td></tr>`).join('')
  return `<h1>${esc(businessName)}</h1><p><b>${d.kind==='sale'?'SALE RECEIPT':'UDHAR PAYMENT RECEIPT'}</b> — ${esc(d.reference)}</p><p>Customer: ${esc(d.partyName)}${d.walkIn?' (Walk-in)':''}</p><p>Date: ${esc(d.date)} · Operator: ${esc(d.actor ?? '')}</p>${d.kind==='sale'?`<table><thead><tr><th>Stock / fabric</th><th>Grade</th><th>Suits</th><th>Length</th></tr></thead><tbody>${details}</tbody></table><p>Sale value: <b>${money(d.total)}</b></p>${d.items.length===1&&d.items[0].suits>0?`<p>Unit sale value: ${money(d.total/d.items[0].suits)}</p>`:""}`:''}<p>Payment received: <b>${money(d.paid)}</b> ${d.method?'via '+esc(d.method):''}</p>${d.kind==='sale'?`<p>New Udhar from this sale: <b>${money(due)}</b></p>`:'<p>Payment applied against existing Udhar.</p>'}<p class="small muted">Reference: ${esc(d._id)} · Customer copy</p>`
}
function dailyHtml(d:Data){
  const t=d.totals
  const rows=d.dailyDocuments.map(x=>`<tr><td>${esc(x.reference)}</td><td>${esc(x.partyName)}</td><td>${x.kind==='sale'?'Sale':'Repayment'}</td><td class="right">${money(x.total)}</td><td class="right">${money(x.paid)}</td><td class="right">${money(x.kind==='sale'?x.total-x.paid:0)}</td></tr>`).join('')
  return `<h1>${esc(d.businessName)}</h1><h2>Daily Sales & Receipts — ${esc(d.day)}</h2><p>Sales: <b>${t.sales}</b>, Walk-ins: <b>${t.walkInSales}</b>, Sales value: <b>${money(t.saleTotal)}</b></p><p>Received with sales: ${money(t.paidAtSale)} · Old Udhar recovered: ${money(t.paymentsAgainstDue)}</p><p>Cash received: ${money(t.cashReceived)} · Bank received: ${money(t.bankReceived)} · New Udhar: ${money(t.newUdhar)}</p><table><thead><tr><th>Reference</th><th>Customer</th><th>Type</th><th class="right">Sale</th><th class="right">Received</th><th class="right">New Udhar</th></tr></thead><tbody>${rows}</tbody></table>${d.dailyCount>d.dailyDocuments.length?'<p><b>IMPORTANT: Only part of the daily register is shown. Use a date-filtered export before official reconciliation.</b></p>':''}<p class="small">Operational POS report. Reconcile against the linked journals; older documents may predate journal integration.</p>`
}

export default function CheckoutPage(){
  const [data,setData]=useState<Data|null>(null)
  const [operation,setOperation]=useState<'sale'|'payment'>('sale')
  const [customerMode,setCustomerMode]=useState<'walkin'|'registered'>('walkin')
  const [partyId,setPartyId]=useState('')
  const [walkInName,setWalkInName]=useState('Walk-in Customer')
  const [newPartyName,setNewPartyName]=useState('')
  const [creatingParty,setCreatingParty]=useState(false)
  const [reference,setReference]=useState('')
  const [selected,setSelected]=useState<string[]>([])
  const [quantityByThaan,setQuantityByThaan]=useState<Record<string,number>>({})
  const [paymentMode,setPaymentMode]=useState<'full'|'credit'|'partial'>('full')
  const [amount,setAmount]=useState('')
  const [partialPaid,setPartialPaid]=useState('0')
  const [paymentMethod,setPaymentMethod]=useState<'cash'|'bank'>('cash')
  const [paper,setPaper]=useState<'a4'|'a5'|'thermal'|'sticker'>('a5')
  const [reportDate,setReportDate]=useState('')
  const [message,setMessage]=useState('')
  const [sending,setSending]=useState(false)
  const busy=useRef(false)
  const pending=useRef<{ reference:string; date:string } | null>(null)

  const load=useCallback(async (date=reportDate,customer=partyId)=>{
    const params=new URLSearchParams()
    if(date)params.set('date',date)
    if(customer)params.set('partyId',customer)
    const r=await fetch('/api/checkout?'+params.toString(),{cache:'no-store'})
    if(!r.ok)throw new Error('Unable to load POS data')
    const next=(await r.json()) as Data
    setData(next)
    return next
  },[reportDate,partyId])
  useEffect(()=>{void load().catch(e=>setMessage(e instanceof Error?e.message:'Could not load POS'))},[load])
  const due=data?.due
  const price=Number(amount||0)
  const received=operation==='payment'||customerMode==='walkin'?price:paymentMode==='full'?price:paymentMode==='credit'?0:Number(partialPaid||0)
  const valid=Number.isSafeInteger(price)&&price>0&&Number.isSafeInteger(received)&&received>=0&&received<=price
  const named=operation==='payment'||customerMode==='registered'
  const saleLines=selected.map(thaanId=>({thaanId,suits:quantityByThaan[thaanId] ?? 1}))
  const validLines=saleLines.length>0 && saleLines.every(line=>{
    const stock=data?.thaans.find(item=>item.id===line.thaanId)
    return stock && Number.isSafeInteger(line.suits) && line.suits>=1 && line.suits<=stock.suits
  })
  const selectedSuits=saleLines.reduce((sum,line)=>sum+line.suits,0)

  async function createParty(){
    const name=newPartyName.trim()
    if(!name) return setMessage('Enter a name for the new customer')
    setCreatingParty(true);setMessage('')
    try{
      const r=await fetch('/api/parties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,kind:'customer'})})
      const j=await r.json().catch(()=>({})) as {error?:string;_id?:string}
      if(!r.ok||!j._id){setMessage(j.error||'Only administrators can create registered customers.');return}
      setCustomerMode('registered');setPartyId(j._id);setNewPartyName('')
      await load(reportDate,j._id)
      setMessage('Customer created and selected. No need to leave POS.')
    }catch{setMessage('Customer creation failed; try again safely.')}
    finally{setCreatingParty(false)}
  }

  async function post(){
    if(busy.current)return
    if(!data||!reference.trim()||!valid||(operation==='sale'&&!validLines)||(named&&!partyId)){
      setMessage('Enter a reference, valid amount, finished thaans and customer details. Walk-ins must pay fully.');return
    }
    busy.current=true;setSending(true);setMessage('')
    const normalized=reference.trim().toUpperCase()
    if(pending.current?.reference!==normalized) pending.current={reference:normalized,date:data.businessDay}
    const date=pending.current.date
    const body=operation==='sale'?{
      kind:'sale',reference:reference.trim().toUpperCase(),date,
      ...(named?{partyId}:{customerName:walkInName.trim()||'Walk-in Customer'}),
      lines:saleLines,total:price,paid:received,...(received?{method:paymentMethod}:{})
    }:{kind:'payment',reference:reference.trim().toUpperCase(),date,partyId,amount:price,method:paymentMethod}
    try{
      const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const j=await r.json().catch(()=>({})) as {error?:string}
      if(!r.ok){setMessage(j.error||'Posting not confirmed; retry with the SAME reference and amounts.');return}
      setMessage(r.status===200?'This document was already posted. No duplicate created.':'Sale/payment posted. Use Print Receipt below.')
      setReference('');setSelected([]);setQuantityByThaan({});setAmount('');setPartialPaid('0')
      pending.current=null
      setReportDate(date)
      await load(date).catch(()=>setMessage('Document posted, but the POS display could not refresh.'))
    }catch{setMessage('Response lost. Retry with the SAME reference and values; do not use a new document number.')}
    finally{busy.current=false;setSending(false)}
  }

  function printReceipt(doc:Doc){printHtml(receiptHtml(doc,data?.businessName ?? 'OarLinks'),paper==='sticker'?'a5':paper,'Receipt '+doc.reference)}
  function printSticker(item:Item){
    try{if(paper==='sticker'&&item.id.length>24)throw new Error('Thaan reference is too long for a reliable 50 × 30 mm barcode; use A4 until calibrated.')
      const text=`<div style="text-align:center"><b>${esc(data?.businessName ?? 'OarLinks')}</b><div>THAAN ${esc(item.id)} · GRADE ${esc(item.grade)}</div><div>${item.suits} suits · ${item.totalUm/1e6} m</div>${barcodeSvg(item.id)}<b>${esc(item.id)}</b></div>`
      printHtml(text,paper==='sticker'?'sticker':'a4','Sticker '+item.id)
    }catch(e){setMessage(e instanceof Error?e.message:'Sticker generation failed')}
  }
  const t=data?.totals
  return <main className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-xl bg-slate-900 p-5 text-white"><h1 className="text-2xl font-bold">OarLinks Textile POS — Sales, Udhar & Receipts</h1><p className="mt-2 text-sm">Sell one suit, several suits or an entire thaan. Handle walk-ins, collect payments and print daily reports.</p></header>
    {data && !data.accountingApproved && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">New postings are blocked. Ask an administrator to review POS accounting in Business Settings. An existing reference can still be retried to confirm a prior posting.</div>}
    <section className="rounded-xl bg-white p-5 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold">Checkout / Receive Payment</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>Operation<select className={input} value={operation} onChange={e=>{const next=e.target.value as 'sale'|'payment';setOperation(next);if(next==='payment')setCustomerMode('registered')}}><option value="sale">New fabric sale</option><option value="payment">Receive old Udhar payment</option></select></label>
        {operation==='sale'&&<label>Buyer<select className={input} value={customerMode} onChange={e=>{const next=e.target.value as 'walkin'|'registered';setCustomerMode(next);if(next==='walkin')setPaymentMode('full')}}><option value="walkin">Walk-in / random customer</option><option value="registered">Existing credit customer</option></select></label>}
        <label>Document number<input className={input} value={reference} onChange={e=>setReference(e.target.value)} placeholder="SALE-0001" maxLength={64}/></label>
      </div>
      {named?<><label className="block">Registered customer<select className={input} value={partyId} onChange={e=>setPartyId(e.target.value)}><option value="">Select customer</option>{data?.parties.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><label>Create a customer without leaving POS<input className={input} value={newPartyName} onChange={e=>setNewPartyName(e.target.value)} placeholder="Customer business / person name"/></label><button type="button" disabled={creatingParty} onClick={()=>void createParty()} className="self-end rounded-lg border px-4 py-2 text-sm disabled:opacity-60">{creatingParty?'Adding...':'Add Customer'}</button></div>
        <p className="text-sm text-slate-600">Current customer outstanding: {due===null||due===undefined?'Not available':money(due)}. Admin access is required to register new customers.</p>
      </>:<label className="block">Walk-in name (optional)<input className={input} value={walkInName} onChange={e=>setWalkInName(e.target.value)} maxLength={100}/></label>}
      {operation==='sale'&&<>
        <h3 className="font-medium">Select stock — one suit or full thaan</h3>
        <p className="text-sm text-slate-600">Tick a thaan, then enter how many suits to sell. Choose 1 for a walk-in buying one suit, or the full available quantity for the whole thaan.</p>
        <div className="max-h-64 overflow-y-auto rounded-lg border p-2">{!data?.thaans.length&&<p className="text-sm">No available finished suits. Pack stock in Warehouse → Production first.</p>}{data?.thaans.map(item=><div key={item.id} className="flex flex-wrap items-center gap-3 border-b p-2 text-sm">
          <label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={e=>{setSelected(current=>e.target.checked?[...current,item.id]:current.filter(x=>x!==item.id));if(e.target.checked)setQuantityByThaan(current=>({...current,[item.id]:current[item.id]??1}))}}/>
            <span>{item.id}{item.fabric && " · " + item.fabric} · Grade {item.grade} · {item.suits} suits left · {(item.totalUm/1e6).toLocaleString('en-PK')} m left</span></label>
          {selected.includes(item.id)&&<div className="flex items-center gap-2"><label className="text-xs">Suits to sell<input aria-label={'Suits to sell from '+item.id} className="ml-2 w-16 rounded border p-1 text-right" type="number" min="1" max={item.suits} step="1" value={quantityByThaan[item.id]??1} onChange={e=>setQuantityByThaan(current=>({...current,[item.id]:Number(e.target.value)}))}/></label><button type="button" className="rounded border px-2 py-1 text-xs" onClick={()=>setQuantityByThaan(current=>({...current,[item.id]:item.suits}))}>All {item.suits}</button></div>}
        </div>)}</div>
        <p className="text-sm font-medium">Selected: {selectedSuits} suit{selectedSuits===1?'':'s'} from {saleLines.length} thaan{saleLines.length===1?'':'s'}. Enter the total selling price for these suits below.</p>
        <label className="block">Sale type<select className={input} value={customerMode==='walkin'?'full':paymentMode} disabled={customerMode==='walkin'} onChange={e=>setPaymentMode(e.target.value as 'full'|'credit'|'partial')}><option value="full">Fully paid (cash / bank)</option><option value="credit">Full Udhar (pay later)</option><option value="partial">Part payment + remaining Udhar</option></select></label>
      </>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label>{operation==='sale'?'Total sale amount (PKR)':'Amount received (PKR)'}<input className={input} type="number" min="1" step="1" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        {operation==='sale'&&paymentMode==='partial'&&customerMode==='registered'&&<label>Payment now (PKR)<input className={input} type="number" min="0" step="1" value={partialPaid} onChange={e=>setPartialPaid(e.target.value)}/></label>}
        {(operation==='payment'||received>0)&&<label>Received via<select className={input} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as 'cash'|'bank')}><option value="cash">Cash</option><option value="bank">Bank transfer</option></select></label>}
      </div>
      <p className="text-sm font-medium">{operation==='sale'?`New Udhar from this sale: ${money(valid?price-received:0)}`:`Payment applied against customer Udhar: ${money(valid?price:0)}`}</p>
      <button type="button" disabled={sending||!valid} onClick={()=>void post()} className="rounded-lg bg-blue-700 px-5 py-2 text-white disabled:opacity-50">{sending?'Posting...':operation==='sale'?'Complete Sale':'Record Payment'}</button>
      <p role="status" className="text-sm text-slate-700">{message}</p>
    </section>
    <section className="rounded-xl bg-white p-5 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold">Daily Sales Report & Cash Register</h2>
      <div className="grid gap-3 sm:grid-cols-3"><label id="daily-sales">Report date<input type="date" className={input} value={reportDate || data?.day || ''} onChange={e=>setReportDate(e.target.value)}/></label><label>Print paper<select className={input} value={paper} onChange={e=>setPaper(e.target.value as typeof paper)}><option value="a4">A4 full sheet</option><option value="a5">A5 compact sheet</option><option value="thermal">80 mm receipt</option><option value="sticker">50 × 30 mm barcode sticker</option></select></label><button type="button" className="self-end rounded-lg border px-4 py-2" disabled={!data} onClick={()=>data&&printHtml(dailyHtml(data),paper==='sticker'?'a4':paper,'Daily Report '+data.day)}>Print Daily Report</button></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[
        ['Sale value',t?.saleTotal??0],['Cash received',t?.cashReceived??0],['Bank received',t?.bankReceived??0],['New Udhar',t?.newUdhar??0],
        ['Received at sale',t?.paidAtSale??0],['Old Udhar collected',t?.paymentsAgainstDue??0],
      ].map(([label,value])=><div key={String(label)} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-600">{label}</p><p className="text-lg font-semibold">{money(Number(value))}</p></div>)}</div>
      <p className="text-sm">{t?.sales??0} sales today · {t?.walkInSales??0} walk-ins. Cash register includes both sales receipts and old Udhar repayments; repayments are not new sales revenue. These totals cover Textile POS documents, not the separate legacy Products/Sales screen.</p>
      {data&&data.dailyCount>data.dailyDocuments.length&&<p className="text-sm font-semibold text-red-700">Report shows only {data.dailyDocuments.length} of {data.dailyCount} daily documents. Do not use its detailed print as a complete daily audit.</p>}
      {data && <p className="text-sm">{data.volume.suitsSold} suits sold · {data.volume.fullThaans} full thaans sold · {formatMicrometers(data.volume.soldUm)} m sold</p>}
      {partyId && <details className="text-sm"><summary>Customer POS history</summary>
        <ul>{data?.customerHistory.map(doc => <li key={doc._id}>{doc.date} · {doc.reference} · {doc.kind === 'sale' ? money(doc.total) + ' sale' : 'Udhar repayment'} · {money(doc.paid)} received</li>)}</ul>
      </details>}
      <h3 className="font-medium">Textile POS documents</h3>
      <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Reference</th><th className="p-2 text-left">Buyer</th><th className="p-2 text-left">Type</th><th className="p-2 text-right">Sale</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">New Udhar</th><th className="p-2">Receipt</th></tr></thead><tbody>{data?.dailyDocuments.map(doc=><tr key={doc._id} className="border-b"><td className="p-2">{doc.reference}<small className="block">{doc.postedAt && new Date(doc.postedAt).toLocaleTimeString()} · {doc.actor}</small></td><td className="p-2">{doc.partyName}</td><td className="p-2">{doc.kind==='sale'?'Sale':'Repayment'}</td><td className="p-2 text-right">{money(doc.total)}</td><td className="p-2 text-right">{money(doc.paid)}</td><td className="p-2 text-right">{money(doc.kind==='sale'?doc.total-doc.paid:0)}</td><td className="p-2"><button onClick={()=>printReceipt(doc)} className="rounded border px-2 py-1">Print</button></td></tr>)}</tbody></table></div>
      <h3 className="font-medium">Cash / bank received today</h3><p className="text-sm">{data?.receipts.map(r=>`${r.reference}: ${money(r.amount)} (${r.method})`).join(' · ')||'No receipts recorded.'}</p>
    </section>
    <section className="rounded-xl bg-white p-5 shadow-sm space-y-3">
      <h2 className="text-lg font-semibold">Print Recent Receipts & Thaan Stickers</h2>
      <p className="text-sm text-slate-600">Click Print to open the browser print dialog immediately. Choose a physical printer or Save as PDF. Sticker sizing requires real printer calibration.</p>
      {data?.recent.map(doc=><div key={doc._id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"><span>{doc.reference} — {doc.partyName} — {doc.kind==='sale'?money(doc.total):'Udhar payment '+money(doc.paid)}</span><div className="flex flex-wrap gap-2"><button className="rounded bg-slate-900 px-3 py-2 text-white" onClick={()=>printReceipt(doc)}>Print Receipt</button>{doc.items.map(i=><button key={i.id} onClick={()=>printSticker(i)} className="rounded border px-3 py-2">Sticker {i.id}</button>)}</div></div>)}
      <h3 className="font-medium">Available stock labels</h3><div className="flex flex-wrap gap-2">{data?.thaans.slice(0,15).map(item=><button key={item.id} onClick={()=>printSticker(item)} className="rounded border px-3 py-2 text-sm">Print {item.id}</button>)}</div>
    </section>
  </main>
}
