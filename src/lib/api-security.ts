import { z } from 'zod'
import { getSession, type Role } from '@/lib/auth'

const permissions = {
  read: ['superadmin', 'admin', 'manager', 'accountant'],
  configure: ['superadmin', 'admin'],
  post: ['superadmin', 'admin', 'manager', 'accountant'],
  inventoryPost: ['superadmin', 'admin', 'manager'],
  members: ['superadmin', 'admin'],
  deleteProduct: ['superadmin'],
} satisfies Record<string, Role[]>

export function apiError(status: number, error: string) {
  return Response.json({ error }, { status })
}

export function sameOrigin(req: Request) {
  const expected = process.env.APP_ORIGIN
  return !!expected && req.headers.get('origin') === expected
}

export async function requirePermission(action: keyof typeof permissions, mutation?: Request) {
  const user = await getSession()
  if (!user) return apiError(401, 'Unauthorized')
  if (!(permissions[action] as Role[]).includes(user.role)) return apiError(403, 'Forbidden')
  if (mutation && !sameOrigin(mutation)) return apiError(403, 'Invalid request origin')
  return null
}

export const id = z.string().regex(/^[a-fA-F0-9]{24}$/)
export const dateOnly = z.iso.date()
export const amount = z.number().min(0).max(1e12)
export const text = z.string().trim().max(500)
export const named = z.strictObject({ name: text.min(1), code: text.optional() })
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T | null> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return null
  const reader = req.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let json = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 256 * 1024) {
        await reader.cancel()
        return null
      }
      json += decoder.decode(value, { stream: true })
    }
    const result = schema.safeParse(JSON.parse(json + decoder.decode()))
    return result.success ? result.data : null
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

export function validateQuery(req: Request) {
  const params = new URL(req.url).searchParams
  for (const [key, value] of params) {
    if (params.getAll(key).length > 1 || value.length > 200) return false
    if (['accountId', 'productId', 'partyId', 'categoryId'].includes(key) && value && !id.safeParse(value).success) return false
    if (['from', 'to'].includes(key) && value && !dateOnly.safeParse(value).success) return false
    if (key === 'limit' && !/^[1-9]\d{0,3}$/.test(value)) return false
    if (key === 'period' && value !== 'day' && value !== 'month') return false
  }
  const from = params.get('from')
  const to = params.get('to')
  return !from || !to || from <= to
}

// Keep driver errors and confidential request values out of framework error logs.
export function safeApi<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args)
    } catch {
      return apiError(503, 'Service unavailable')
    }
  }
}
