import { NextResponse } from 'next/server'
import { AUTH_COOKIE, cookieOptions, revokeSession } from '@/lib/auth'
import { requirePermission } from '@/lib/api-security'

export async function POST(req: Request) {
  const denied = await requirePermission('read', req)
  if (denied) return denied
  await revokeSession()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, '', { ...cookieOptions, maxAge: 0 })
  return res
}
