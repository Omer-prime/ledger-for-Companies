import { apiError, id, requirePermission, safeApi } from '@/lib/api-security'

async function immutable(req: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
  if (!id.safeParse((await context.params).id).success) return apiError(400, 'Invalid transaction ID')
  return apiError(409, 'Posted transactions are immutable')
}

export const PATCH = safeApi(async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  return immutable(req, context)
})

export const DELETE = safeApi(async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  return immutable(req, context)
})
