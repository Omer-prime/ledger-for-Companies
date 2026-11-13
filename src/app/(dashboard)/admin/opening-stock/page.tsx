import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import SectionHeader from '@/app/components/SectionHeader'
import OpeningStockForm from './OpeningStockForm'

export default async function OpeningStockPage() {
  const actor=await getSession()
  if(!actor||!['admin','superadmin'].includes(actor.role)) redirect('/admin')
  return <main className="space-y-4"><SectionHeader section="Shop setup" title="Opening Stock — Existing Suits & Thaans">Purana stock: record what is physically in the shop before using POS.</SectionHeader><OpeningStockForm /></main>
}
