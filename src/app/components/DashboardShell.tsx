import type { ReactNode } from 'react'
import Sidebar from './Sidebar'

export default function DashboardShell({ children, canConfigureBusiness }: {
  children: ReactNode
  canConfigureBusiness: boolean
}) {
  return (
    <div className="w-full px-3 py-4 md:px-6 md:py-6 xl:px-10">
      <div className="grid min-h-[100dvh] grid-cols-1 gap-4 md:grid-cols-[310px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="no-print"><Sidebar canConfigureBusiness={canConfigureBusiness} /></div>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  )
}
