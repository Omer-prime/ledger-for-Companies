import { createHash, randomBytes } from 'node:crypto'
import type { Types } from 'mongoose'
import { cookies } from 'next/headers'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { ROLES, type Role } from '@/lib/roles'
export type { Role } from '@/lib/roles'
export type SessionUser = { email: string; role: Role }

export const AUTH_COOKIE = '__Host-ledger_session'
export const SESSION_SECONDS = 8 * 60 * 60
export const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

async function sessions() {
  return (await dbConnect()).connection.collection<{ _id: string; userId: Types.ObjectId; credentialVersion: string; expiresAt: Date }>('auth_sessions')
}

async function currentToken() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

export async function revokeSession() {
  const token = await currentToken()
  if (token) await (await sessions()).deleteOne({ _id: digest(token) })
}

export async function createSession(userId: Types.ObjectId, passwordHash: string) {
  const token = randomBytes(32).toString('hex')
  await (await sessions()).insertOne({
    _id: digest(token),
    userId,
    credentialVersion: digest(passwordHash),
    expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
  })
  return token
}

export async function getSession(): Promise<SessionUser | null> {
  const token = await currentToken()
  if (!token) return null
  const session = await (await sessions()).findOne({
    _id: digest(token),
    expiresAt: { $gt: new Date() },
  })
  if (!session) return null
  const user = await User.findById(session.userId).select('+passwordHash').lean()
  if (!user || user.disabled || !user.passwordHash || !ROLES.includes(user.role)) return null
  if (digest(user.passwordHash) !== session.credentialVersion) return null
  return { email: user.email, role: user.role }
}

export async function isAuthed() {
  return (await getSession()) !== null
}

export async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('UNAUTHENTICATED')
  return session
}
