import { cookies } from 'next/headers'

export const AUTH_COOKIE = 'ledger_auth'

export type Role = 'superadmin' | 'admin' | 'manager' | 'accountant'
export type SessionUser = { email: string; role: Role }

function decodeSession(raw?: string | null): SessionUser | null {
  if (!raw) return null
  try {
    const json = Buffer.from(raw, 'base64').toString('utf8')
    const data = JSON.parse(json) as SessionUser
    if (data?.email && data?.role) return data
  } catch {}
  return null
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies()
  const raw = jar.get(AUTH_COOKIE)?.value ?? null
  return decodeSession(raw)
}

export async function isAuthed(): Promise<boolean> {
  return (await getSession()) !== null
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession()
  if (!s) throw new Error('UNAUTHENTICATED')
  return s
}
