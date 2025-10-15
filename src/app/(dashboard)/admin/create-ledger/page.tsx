import CreateLedgerClient from '../../../components/CreateLedgerClient'

export default function CreateLedgerPage() {
  return (
    <main className="space-y-4">
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <h1 className="text-lg font-semibold">Create Ledger</h1>
        <p className="mt-1 text-sm text-slate-600">
          Select a ledger category. If it’s a <b>Party Ledger</b>, pick a party as well.
          Columns are fixed to <b>Date, Description, Total&nbsp;Due, Debit, Credit, Remaining</b>.
          Remaining is auto-calculated. Selecting a party will prefill the next row’s
          <b> Total&nbsp;Due</b> with the party’s outstanding. Saving assigns rows to the selected
          party when not set per row.
        </p>
      </section>
      <CreateLedgerClient />
    </main>
  )
}
