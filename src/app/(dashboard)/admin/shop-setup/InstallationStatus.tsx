'use client'

import { useEffect,useState } from 'react'

export default function InstallationStatus(){
 const [status,setStatus]=useState<{version:string;update:string}>()
 const [checking,setChecking]=useState(false)
 async function refresh() {
  setChecking(true)
  try {
   const response=await fetch('/_installation/version',{cache:'no-store'})
   if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return
   const value=await response.json()
   if(typeof value.version==='string'&&typeof value.update==='string')setStatus(value)
  } catch { /* The local Windows host is optional. */ }
  finally {setChecking(false)}
 }
 useEffect(()=>{if(window.location.origin==='https://localhost:37443')void refresh()},[])
 if(!status)return null
 return <section className="rounded-2xl border bg-white p-5">
   <h2 className="font-semibold">Installed version {status.version}</h2>
   <p role="status">{status.update}</p>
   <button type="button" disabled={checking} onClick={()=>void refresh()} className="mt-2 rounded-lg border px-3 py-2">Refresh update status</button>
   <p className="text-sm text-slate-600">Windows checks for approved releases on its scheduled maintenance task.</p>
 </section>
}
