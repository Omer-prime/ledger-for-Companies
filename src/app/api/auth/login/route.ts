import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AUTH_COOKIE, SESSION_SECONDS, cookieOptions, createSession, digest, revokeSession } from '@/lib/auth'
import { apiError, readBody, sameOrigin } from '@/lib/api-security'
import { ROLES } from '@/lib/roles'
import { verifyPassword } from '@/lib/password'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'

const credentials = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).email(),
  password: z.string().min(1).max(256),
})

export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError(403, 'Invalid request origin')
  const body = await readBody(req, credentials)
  if (!body) return apiError(400, 'Invalid credentials payload')

  const db = (await dbConnect()).connection
  const attempts = db.collection<{ _id: string; count: number; expiresAt: Date }>('auth_attempts')
  const windowMs = 15 * 60 * 1000
  const window = Math.floor(Date.now() / windowMs)
  for (const [key, limit] of [['global', 300], [digest(body.email), 10]] as const) {
    const attempt = await attempts.findOneAndUpdate(
      { _id: window + ':' + key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * windowMs) } },
      { upsert: true, returnDocument: 'after' },
    )
    if (!attempt || attempt.count > limit) return apiError(429, 'Too many login attempts')
  }

  const user = await User.findOne({ email: body.email }).select('+passwordHash').lean()
  const hash = user?.passwordHash
  const verified = await verifyPassword(body.password, hash)
  if (!verified || !user || !hash || user.disabled || !ROLES.includes(user.role)) {
    return apiError(401, 'Invalid credentials')
  }

  await revokeSession()
  const token = await createSession(user._id, hash)
  const res = NextResponse.json({ ok: true, role: user.role })
  res.cookies.set(AUTH_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS })
  return res
}
