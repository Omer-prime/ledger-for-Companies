// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: process.env.APP_NAME || 'Ledger',
  description: 'Ledger system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      {/* m-0 removes the 8px default margin; min-h-dvh is the safest full-height */}
      <body className="m-0 h-full min-h-dvh antialiased">
        {children}
      </body>
    </html>
  )
}
