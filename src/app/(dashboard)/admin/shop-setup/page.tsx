import Link from 'next/link'
import InstallationStatus from './InstallationStatus'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import SectionHeader from '@/app/components/SectionHeader'
import { dbConnect } from '@/lib/db'
import { BusinessSettings } from '@/models/BusinessSettings'
import { posAccounting } from '@/lib/pos-accounting'
import { textileProduction } from '@/models/TextileProduction'
import { Account } from '@/models/Account'

const steps=[
 ['Business profile','Dukaan ki maloomat: business name, address and dates.','/admin/business-settings'],
 ['Financial accounts and approval','Khate: map accounts and record accountant approval.','/admin/financial-setup'],
 ['Opening stock','Purana stock: count, verify cost, then reconcile with the accounts.','/admin/opening-stock'],
 ['Customers and suppliers','Gahak aur suppliers: add the contacts you use.','/admin/parties'],
 ['Printer test','Test A4, A5, 80 mm receipts and labels with a demo sale before using customer records.','/admin/checkout'],
]
export default async function ShopSetup() {
 const actor=await getSession()
 if(!actor||!['admin','superadmin'].includes(actor.role)) redirect('/admin')
 const conn=(await dbConnect()).connection
 const [profile,approval,batches,contacts]=await Promise.all([
   BusinessSettings.exists({}),
   posAccounting(conn).findOne({}, {sort:{_id:-1}}),
   textileProduction(conn).openingBatches.countDocuments(),
   Account.countDocuments({type:{$in:['party','customer','supplier']},archivedAt:null}),
 ])
 const states=[profile?'Settings saved':'Not saved',approval?.approval?'Approval recorded · revision '+approval._id:'Awaiting accountant approval',batches?batches+' recorded · '+(approval?.approval?.capitalizedOpeningIds?.length??0)+' approved':'No batches recorded',contacts?contacts+' active accounts':'No contacts recorded','Manual hardware check']
 return <main className="mx-auto max-w-6xl space-y-4">
   <SectionHeader section="Administration" title="Set up your shop">Work through these steps before opening the till.</SectionHeader>
   <InstallationStatus /><ol className="grid gap-4 md:grid-cols-2">{steps.map(([title,note,href],i)=>
     <li key={href} className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
       <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">{states[i]}</span>
       <h2 className="text-lg font-semibold">{i+1}. {title}</h2>
       <p className="text-sm text-slate-600">{note}</p>
       <Link className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white" href={href}>Open {title.toLowerCase()}</Link>
     </li>)}</ol>
   <section className="space-y-2 rounded-2xl border bg-white p-5"><h2 className="font-semibold">Before using live POS</h2><p className="text-sm text-slate-600">Confirm opening receivables, stock and GL balances with the accountant. Verify a backup restore, Windows restart and physical printer.</p><Link href="/admin/members" className="text-sm text-blue-800 underline">Advanced: Staff Accounts</Link></section>
 </main>
}
