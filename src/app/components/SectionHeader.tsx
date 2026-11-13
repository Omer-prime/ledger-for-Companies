import type { ReactNode } from 'react'

export default function SectionHeader({ section, title, children }: {
  section: string
  title: string
  children: ReactNode
}) {
  return (
    <header className="no-print rounded-2xl bg-slate-900 p-6 text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">OarLinks / {section}</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <div className="mt-2 text-sm text-slate-300">{children}</div>
    </header>
  )
}
