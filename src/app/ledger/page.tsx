import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import DashboardShell from '@/app/components/DashboardShell'
import SectionHeader from '@/app/components/SectionHeader'
import LedgerClient from '@/app/components/LedgerClient'

export default async function LedgerPage() {
  const user = await getSession()
  if (!user) redirect('/admin/login')
  return (
    <DashboardShell canConfigureBusiness={user.role === 'admin' || user.role === 'superadmin'}>
      <main className="space-y-4">
        <SectionHeader section="Customers" title="Customer statements">
          Select the customer and dates. Outstanding starts with the opening balance and adds posted debits minus posted credits. Reconcile unclear legacy entries against their original documents.
        </SectionHeader>
        <LedgerClient />
      </main>
    </DashboardShell>
  )
}
