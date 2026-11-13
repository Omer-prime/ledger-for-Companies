import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import SectionHeader from '@/app/components/SectionHeader'
import OpeningStockForm from './OpeningStockForm'
import { BusinessSettings } from '@/models/BusinessSettings'
import { defaultBusinessSettings } from '@/lib/business-settings'

export default async function OpeningStockPage() {
  const actor=await getSession()
  if(!actor||!['admin','superadmin'].includes(actor.role)) redirect('/admin')
  const settings=(await BusinessSettings.findOne().sort({_id:-1}).lean())?.settings??defaultBusinessSettings
  const countDate=new Intl.DateTimeFormat('en-CA',{timeZone:settings.localization.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  return <main className="mx-auto max-w-6xl space-y-4"><SectionHeader section="Shop setup" title="Opening Stock — Existing Suits & Thaans">Purana stock: record what is physically in the shop before using POS.</SectionHeader><OpeningStockForm countDate={countDate} standard={settings.thaan.suitsPerThaan} grades={settings.grades.filter(grade=>grade.enabled)} /></main>
}
