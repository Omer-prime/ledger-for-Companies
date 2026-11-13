import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import SectionHeader from '@/app/components/SectionHeader'

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
 return <main className="space-y-4"><SectionHeader section="Administration" title="Set up your shop">Follow these steps before opening the till.</SectionHeader><ol className="grid gap-3 md:grid-cols-2">{steps.map(([title,note,href],i)=><li key={href} className="rounded-xl border bg-white p-5"><Link className="font-semibold text-blue-800 underline" href={href}>{i+1}. {title}</Link><p>{note}</p></li>)}</ol><section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Ready for use?</h2><p>Confirm opening receivables, stock and GL balances with the accountant. Verify a backup restore, Windows restart and physical printer before using live POS.</p><Link href="/admin/members" className="mt-3 inline-block text-sm underline">Advanced: Staff Accounts</Link></section></main>
}
