import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import DashboardShell from '../../components/DashboardShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession()
  if (!user) redirect('/admin/login')

  return <DashboardShell canConfigureBusiness={user.role === 'admin' || user.role === 'superadmin'}>{children}</DashboardShell>
}
