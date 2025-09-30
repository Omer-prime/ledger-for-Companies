// src/app/(dashboard)/admin/page.tsx
import Link from 'next/link'

export default function AdminHome() {
  return (
    <main className="space-y-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 text-white shadow-soft">
        <div className="relative p-6 md:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Welcome 👋
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-white/85">
            Manage categories, parties, products and build ledgers. Use the quick actions below to get started fast.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/admin/create-ledger"
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow-soft transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              + Create Ledger
            </Link>
            <Link
              href="/admin/reports"
              className="rounded-xl border border-white/40 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              View Reports
            </Link>
          </div>
        </div>
      </section>

      {/* KPI / Shortcuts */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardStat title="Ledger Categories" hint="Organize your ledgers" link="/admin/categories" />
        <CardStat title="Parties" hint="Buyers / Suppliers" link="/admin/parties" />
        <CardStat title="Products" hint="Items & rates" link="/admin/products" />
        <CardStat title="Members" hint="Manage access" link="/admin/members" />
      </section>

      {/* Quick Actions */}
      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Quick actions</h2>
            <p className="mt-1 text-sm text-slate-500">Common tasks you’ll do every day.</p>
          </div>
          <Link
            href="/admin/reports"
            className="hidden rounded-xl border px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 md:inline-block"
          >
            Open Reports
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ActionTile
            title="Build a new Ledger"
            desc="Choose columns, add entries, print or export."
            href="/admin/create-ledger"
            icon="🧾"
          />
          <ActionTile
            title="Ledger Categories"
            desc="Create categories for Party, Product, Bank, etc."
            href="/admin/categories"
            icon="🗂️"
          />
          <ActionTile
            title="Add Parties"
            desc="Create customers / suppliers for party ledgers."
            href="/admin/parties"
            icon="👥"
          />
          <ActionTile
            title="Add Products"
            desc="Maintain product name, code and base rate."
            href="/admin/products"
            icon="📦"
          />
          <ActionTile
            title="Download Reports"
            desc="Export statements with daily/monthly totals."
            href="/admin/reports"
            icon="📊"
          />
          <ActionTile
            title="Invite Member"
            desc="Give teammates access to the admin."
            href="/admin/members"
            icon="👤"
          />
        </div>
      </section>

      {/* Tips / Help */}
      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-blue-900">
        <div className="flex items-start gap-3">
          <span className="text-xl leading-none">💡</span>
          <div>
            <h3 className="font-semibold">Pro tips</h3>
            <ul className="mt-1 list-inside list-disc text-sm leading-6">
              <li>
                For Party/Product ledgers, start typing in the Description/Product cell to search and auto-fill details.
              </li>
              <li>Printing looks best from Chrome — use “A4” and keep margins to default.</li>
              <li>Use “Monthly totals” in reports when sharing statements with clients.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  )
}

/* ---------- presentational helpers ---------- */

function CardStat({
  title,
  hint,
  link,
}: {
  title: string
  hint: string
  link: string
}) {
  return (
    <Link
      href={link}
      className="group block rounded-2xl bg-white p-4 shadow-soft ring-1 ring-transparent transition hover:-translate-y-0.5 hover:ring-blue-200"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] text-slate-500">{hint}</div>
          <div className="mt-1 text-lg font-semibold text-slate-800">{title}</div>
        </div>
        <svg
          className="h-8 w-8 text-blue-600 opacity-80 transition group-hover:opacity-100"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M5 12h14" />
          <path d="M12 5l7 7-7 7" />
        </svg>
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
        <div className="h-2 w-1/3 rounded-full bg-blue-600/80 transition group-hover:w-2/3" />
      </div>
    </Link>
  )
}

function ActionTile({
  title,
  desc,
  href,
  icon,
}: {
  title: string
  desc: string
  href: string
  icon: string
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/40"
    >
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-100 text-lg">
        {icon}
      </div>
      <div>
        <div className="font-medium text-slate-800">{title}</div>
        <div className="text-sm text-slate-500">{desc}</div>
      </div>
    </Link>
  )
}
