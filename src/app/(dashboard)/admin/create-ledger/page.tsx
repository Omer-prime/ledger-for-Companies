import CreateLedgerClient from '../../../components/CreateLedgerClient'

export default function CreateLedgerPage() {
  return (
    <main className="space-y-4">
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <h1 className="text-lg font-semibold">Create Ledger</h1>
        <p className="mt-1 text-sm text-slate-600">
          Select a ledger category, choose columns, rename headers, and start entering data.
          Date is required. Add Debit/Credit to auto-calc totals & running balance.
          Save to send entries to Reports.
        </p>
      </section>
      <CreateLedgerClient />
    </main>
  )
}
