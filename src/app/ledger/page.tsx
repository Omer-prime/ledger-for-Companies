import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import LedgerClient from '../components/LedgerClient'


export default async function LedgerPage() {
    if (!(await getSession())) redirect('/admin/login')
    return (
        <main className="space-y-4">
            <div className="rounded-3xl bg-brand/5 p-6 shadow-soft">
                <h2 className="text-xl font-semibold">Party Ledger</h2>
                <p className="text-sm opacity-70">Filter by account & date. Add entries via API (UI form comes next step).</p>
            </div>
            <LedgerClient />
        </main>
    )
}