import { z } from 'zod'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { getSession } from '@/lib/auth'
import { apiError, readBody, requirePermission, text, safeApi } from '@/lib/api-security'
import { hashPassword } from '@/lib/password'

const member = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).email(),
  password: z.string().min(12).max(256),
  name: text.optional(),
  role: z.enum(['admin', 'manager', 'accountant']),
})

export const GET = safeApi(async function GET() {
  const denied = await requirePermission('members')
  if (denied) return denied
  await dbConnect()
  const list = await User.find().select('_id name email role createdAt updatedAt').sort({ createdAt: -1 }).lean()
  return Response.json(list)
})

export const POST = safeApi(async function POST(req: Request) {
  const denied = await requirePermission('members', req)
  if (denied) return denied
  const body = await readBody(req, member)
  if (!body) return apiError(400, 'Invalid member payload')
  if (body.role === 'admin' && (await getSession())?.role !== 'superadmin') {
    return apiError(403, 'Forbidden')
  }
  const { password, ...fields } = body
  await dbConnect()
  try {
    const created = await User.create({ ...fields, passwordHash: await hashPassword(password) })
    return Response.json({
      _id: created._id, name: created.name, email: created.email, role: created.role,
      createdAt: created.createdAt, updatedAt: created.updatedAt,
    }, { status: 201 })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
      return apiError(409, 'Email already exists')
    }
    return apiError(500, 'Unable to create member')
  }
})
