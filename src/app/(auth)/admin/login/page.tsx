// app/admin/login/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rememberEmail, setRememberEmail] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('adminEmail')
    if (saved) setEmail(saved)
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setLoading(false)
    if (res.ok) {
      if (rememberEmail) localStorage.setItem('adminEmail', email)
      else localStorage.removeItem('adminEmail')
      router.push('/admin')
    } else {
      setError('Invalid email or password')
    }
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900">
      <div className="mx-auto grid min-h-dvh max-w-6xl grid-rows-[auto_1fr_auto] p-4 md:p-8">
        {/* Top brand / heading */}
        <header className="mb-6 flex items-center justify-between text-white/90">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <span className="text-sm font-bold">LC</span>
            </div>
            <h1 className="text-lg font-semibold tracking-tight md:text-xl">Ledger Console</h1>
          </div>
          <a
            href="https://advistors.co.uk"
            target="_blank"
            rel="noreferrer"
            className="text-xs underline decoration-white/40 underline-offset-2 hover:decoration-white"
          >
            Powered by Advistors
          </a>
        </header>

        {/* Center card */}
        <div className="grid place-items-center">
          <form
            onSubmit={onSubmit}
            className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 transition-transform duration-150 hover:translate-y-[1px]"
          >
            <div className="grid md:grid-cols-2">
              {/* Left: form */}
              <div className="p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Sign in with your admin credentials to continue.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">Email</label>
                    <input
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-600">Password</label>
                    <div className="flex gap-2">
                      <input
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                        type={showPass ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((s) => !s)}
                        className="shrink-0 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
                        title={showPass ? 'Hide password' : 'Show password'}
                      >
                        {showPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={rememberEmail}
                        onChange={(e) => setRememberEmail(e.target.checked)}
                      />
                      Remember email
                    </label>
                    <span className="text-xs text-slate-500">Need access? Contact an admin.</span>
                  </div>

                  {error && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-base font-medium text-white shadow-md hover:bg-blue-700 active:translate-y-[1px] disabled:opacity-60"
                  >
                    {loading ? 'Signing in…' : 'Sign in'}
                  </button>
                </div>

                <p className="mt-6 hidden text-xs text-slate-500 md:block">
                  By continuing you agree to the Terms & Privacy Policy.
                </p>
              </div>

              {/* Right: accent panel */}
              <div className="hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 p-8 text-white md:block">
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                      🔒
                    </div>
                    <h3 className="text-lg font-semibold">Secure Admin Access</h3>
                    <p className="mt-1 text-sm text-white/80">
                      Encrypted connections, role-based permissions, and audit-friendly reporting — all in one console.
                    </p>
                  </div>
                  <ul className="mt-6 space-y-2 text-sm text-white/85">
                    <li>• Fast, responsive UI</li>
                    <li>• Role control: Superadmin → Accountant</li>
                    <li>• Export reports in 1 click</li>
                  </ul>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <footer className="mt-6 text-center text-xs text-white/70">
          © {new Date().getFullYear()} Ledger Console • All rights reserved
        </footer>
      </div>
    </main>
  )
}
