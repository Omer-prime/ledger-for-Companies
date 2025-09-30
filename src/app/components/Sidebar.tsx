'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

const items = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/categories', label: 'Add Ledger Categories' },
  { href: '/admin/parties', label: 'Add Parties' },
  { href: '/admin/create-ledger', label: 'Create Ledger' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/members', label: 'Add Member' },
  { href: '/admin/banks', label: 'Add Banks' },
  { href: '/admin/products', label: 'Add Products' },
  { href: '/admin/product-categories', label: 'Add Product Categories' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // close drawer on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // lock body scroll while mobile drawer is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // esc to close drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/admin/login')
  }

  // ensure ONLY ONE active item: choose the single longest href that matches the pathname
  const activeHref = useMemo(() => {
    let best = ''
    for (const it of items) {
      const isExact = pathname === it.href
      const isPrefix = pathname.startsWith(it.href + '/')
      if (isExact || isPrefix) {
        if (it.href.length > best.length) best = it.href
      }
    }
    // special-case /admin to only be active when exactly on /admin
    if (best === '/admin' && pathname !== '/admin') return ''
    return best
  }, [pathname])

  const Nav = useMemo(
    () =>
      function Nav() {
        return (
          <div className="flex h-full flex-col">
            {/* Brand / Header */}
            <div className="mb-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white shadow-soft">
              <div className="text-xs uppercase tracking-wide/loose opacity-90">Admin</div>
              <h2 className="mt-1 text-xl font-semibold leading-tight tracking-tight">
                Ledger Console
              </h2>
            </div>

            {/* Links */}
            <nav className="flex-1 overflow-auto pr-1">
              <ul className="space-y-1 text-sm">
                {items.map((it) => {
                  const active = it.href === activeHref
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        aria-current={active ? 'page' : undefined}
                        className={[
                          'group relative block w-full rounded-xl px-4 py-2 transition',
                          'ring-1 ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60',
                          active
                            ? 'bg-blue-600 text-white shadow-soft'
                            : 'bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-800 hover:shadow-sm',
                        ].join(' ')}
                      >
                        {/* Leading accent / bullet */}
                        <span
                          aria-hidden
                          className={[
                            'mr-2 inline-block h-2 w-2 align-middle rounded-full transition',
                            active ? 'bg-white' : 'bg-slate-300 group-hover:bg-blue-400',
                          ].join(' ')}
                        />
                        <span className="align-middle font-medium">{it.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>

            {/* Footer area */}
            <div className="mt-4 space-y-3 border-t pt-4">
              {/* 3D Logout button */}
              <button
                onClick={logout}
                className={[
                  'w-full rounded-xl bg-gradient-to-b from-rose-500 to-rose-600 px-4 py-2',
                  'text-white shadow-[0_4px_0_0_rgba(190,18,60,0.7)] transition',
                  'hover:translate-y-[1px] active:translate-y-[2px]',
                ].join(' ')}
                title="Sign out"
              >
                Logout
              </button>

              {/* Powered by */}
              <p className="px-1 text-center text-xs text-slate-500">
                Powered by{' '}
                <a
                  href="https://advistors.co.uk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
                >
                  Advistors
                </a>
              </p>
            </div>
          </div>
        )
      },
    [activeHref] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <>
      {/* Mobile topbar */}
      <div className="mb-2 flex items-center justify-between md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm sm:text-base transition hover:bg-slate-50"
          aria-label="Open menu"
        >
          {/* Hamburger icon */}
          <svg
            className="h-5 w-5 text-slate-700"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="font-medium">Menu</span>
        </button>

        <button
          onClick={logout}
          className="rounded-xl border px-3 py-2 text-sm sm:text-base transition hover:bg-slate-50"
        >
          Logout
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside
        className="
          hidden md:block md:sticky md:top-4 md:self-start
          md:h-[calc(100vh-3rem)] md:overflow-hidden
          md:bg-transparent md:shadow-none md:rounded-none md:p-0
        "
      >
        <div className="h-full pr-0 md:pr-6">
          <div className="h-full rounded-2xl bg-white p-3 shadow-soft ring-1 ring-slate-100">
            <Nav />
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <aside
            className="
              absolute left-0 top-0 flex h-full w-full max-w-[520px] flex-col
              bg-white shadow-soft transition-transform sm:w-2/3
            "
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-blue-700" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="8" />
                </svg>
                <h2 className="text-base font-semibold">Menu</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border px-2 py-1 text-sm transition hover:bg-slate-50"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <Nav />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
