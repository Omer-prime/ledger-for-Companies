import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import BusinessSettingsForm from './BusinessSettingsForm'

export default async function BusinessSettingsPage() {
  const user = await getSession()
  if (!user) redirect('/admin/login')
  if (user.role !== 'admin' && user.role !== 'superadmin') redirect('/admin')
  return <BusinessSettingsForm />
}
