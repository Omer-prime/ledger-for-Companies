import { NextResponse } from 'next/server'
import { AUTH_COOKIE, type SessionUser, type Role } from '@/lib/auth'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'

function makeCookie(user: SessionUser) {
  const val = Buffer.from(JSON.stringify(user), 'utf8').toString('base64')
  return val
}

export async function POST(req: Request) {
  const { email, password } = await req.json()

  // ENV superadmin
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    const res = NextResponse.json({ ok: true, role: 'superadmin' as Role })
    res.cookies.set(AUTH_COOKIE, makeCookie({ email, role: 'superadmin' }), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8
    })
    return res
  }

  // DB user
  await dbConnect()
  const u = await User.findOne({ email }).lean()
  if (!u || u.password !== password) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, role: u.role as Role })
  res.cookies.set(AUTH_COOKIE, makeCookie({ email: u.email, role: u.role as Role }), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8
  })
  return res
}
