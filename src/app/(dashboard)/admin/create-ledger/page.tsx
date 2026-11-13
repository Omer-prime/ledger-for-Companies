import Link from 'next/link'
import SectionHeader from '@/app/components/SectionHeader'

export default function CreateLedgerPage() {
  return (
    <main className="space-y-4">
      <SectionHeader section="General ledger" title="Legacy ledger review">
        The old worksheet has been retired. Its Total Due field did not match the amounts saved to the ledger.
      </SectionHeader>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Review existing entries before making corrections</h2>
        <p className="text-sm text-slate-600">Historical entries are unchanged. A worksheet amount or an old opening figure may require reconciliation with the original documents. Do not re-enter it as new Udhar.</p>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" href="/ledger">Open customer statements</Link>
          <Link className="rounded-lg border border-slate-300 px-4 py-2 font-semibold" href="/admin/checkout">Open POS</Link>
          <Link className="rounded-lg border border-slate-300 px-4 py-2 font-semibold" href="/admin/reports">Review general ledger reports</Link>
        </div>
      </section>
    </main>
  )
}
