import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: process.env.APP_NAME || 'Ledger',
  description: 'Ledger system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        {/* Edge-to-edge with nice breathing room */}
        <div className="w-full px-3 md:px-6 xl:px-10 py-4 md:py-6">
          {children}
        </div>
      </body>
    </html>
  )
}
