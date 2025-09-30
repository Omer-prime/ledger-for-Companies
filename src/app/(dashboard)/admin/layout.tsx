import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/auth'
import Sidebar from '../../components/Sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ok = await isAuthed()
  if (!ok) redirect('/admin/login')

  return (
    <div className="grid min-h-[calc(100vh-3rem)] grid-cols-1 gap-4 md:grid-cols-[310px_1fr] 2xl:grid-cols-[340px_1fr]">
      <Sidebar />
      <section className="min-h-full">{children}</section>
    </div>
  )
}
