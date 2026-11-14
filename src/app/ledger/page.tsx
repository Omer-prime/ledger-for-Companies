import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import DashboardShell from '@/app/components/DashboardShell'
import SectionHeader from '@/app/components/SectionHeader'
import LedgerClient from '@/app/components/LedgerClient'

import { BusinessSettings } from '@/models/BusinessSettings'
import { defaultBusinessSettings } from '@/lib/business-settings'

export default async function LedgerPage() {
  const user = await getSession()
  if (!user) redirect('/admin/login')
  const revision = await BusinessSettings.findOne().sort({ _id: -1 }).lean()
  return (
    <DashboardShell canConfigureBusiness={user.role === 'admin' || user.role === 'superadmin'}>
      <main className="space-y-4">
        <SectionHeader section="Customers" title="Customer statements">
          Select the customer and dates. Outstanding starts with the opening balance and adds posted debits minus posted credits. Reconcile unclear legacy entries against their original documents.
        </SectionHeader>
        <LedgerClient timeZone={(revision?.settings ?? defaultBusinessSettings).localization.timeZone} />
      </main>
    </DashboardShell>
  )
}
