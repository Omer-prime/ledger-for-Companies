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
    <main className="min-h-[100dvh] bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900">
      <div className="mx-auto grid min-h-[100dvh] max-w-6xl grid-rows-[auto_1fr_auto] p-4">
        {/* Top brand / heading */}
        <header className="mb-6 flex items-center justify-between text-white/90">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <span className="text-sm font-bold">LC</span>
            </div>
            <h1 className="text-base font-semibold tracking-tight">Ledger Console</h1>
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
            className="w-full max-w-md rounded-2xl bg-white/80 p-6 shadow-2xl ring-1 ring-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/60"
          >
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Admin Login</h2>
              <p className="text-xs text-slate-500">Use your admin credentials to continue.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-600">Email</label>
                <input
                  className="w-full rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
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
                    className="w-full rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="shrink-0 rounded-xl border px-3 py-2 text-sm text-slate-600 shadow hover:bg-slate-50"
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
                {/* If you add reset route later, link it here */}
                <span className="text-xs text-slate-500">Need access? Contact an admin.</span>
              </div>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 px-4 py-2 text-white shadow-lg hover:bg-blue-700 active:translate-y-[1px] disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
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
