import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import SectionHeader from '@/app/components/SectionHeader'
import PosAccountingForm from '../business-settings/PosAccountingForm'

export default async function FinancialSetup() {
  const actor=await getSession()
  if(!actor || !['admin','superadmin'].includes(actor.role)) redirect('/admin')
  return <main><SectionHeader section="Shop setup" title="Financial Setup">Choose the accounts your accountant uses, or create missing accounts with no opening balance.</SectionHeader><PosAccountingForm guided /><Link className="mt-4 block underline" href="/admin/shop-setup">Back to shop setup</Link></main>
}
