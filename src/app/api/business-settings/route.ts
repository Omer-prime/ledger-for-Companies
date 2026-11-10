import { z } from 'zod'
import { apiError, readBody, requirePermission, safeApi } from '@/lib/api-security'
import { getSession } from '@/lib/auth'
import { businessSettingsSchema, defaultBusinessSettings } from '@/lib/business-settings'
import { dbConnect } from '@/lib/db'
import { BusinessSettings } from '@/models/BusinessSettings'

const update = z.strictObject({
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  settings: businessSettingsSchema,
})

export const GET = safeApi(async function GET(req: Request) {
  const denied = await requirePermission('configure')
  if (denied) return denied
  const revisions = new URL(req.url).searchParams.getAll('revision')
  const revision = revisions[0]
  if (revisions.length > 1 || (revision !== undefined && (!/^\d{1,16}$/.test(revision) || !Number.isSafeInteger(Number(revision))))) {
    return apiError(400, 'Invalid revision')
  }
  await dbConnect()
  const requested = revision === undefined ? undefined : Number(revision)
  const current = requested === 0 ? null : await BusinessSettings.findOne(
    requested === undefined ? {} : { _id: requested },
  ).sort({ _id: -1 }).lean()
  if (!current && requested) return apiError(404, 'Settings revision not found')
  return Response.json({
    revision: current?._id ?? 0,
    settings: current?.settings ?? defaultBusinessSettings,
    savedAt: current?.savedAt ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
})

export const PUT = safeApi(async function PUT(req: Request) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
  const actor = await getSession()
  if (!actor || !['admin', 'superadmin'].includes(actor.role)) return apiError(403, 'Forbidden')
  const body = await readBody(req, update)
  if (!body) return apiError(400, 'Invalid settings. Check required fields, formats, and unique codes.')
  await dbConnect()

  const current = await BusinessSettings.findOne().sort({ _id: -1 }).select('_id').lean()
  if ((current?._id ?? 0) !== body.revision) return apiError(409, 'Settings changed. Reload before saving again.')
  const revision = body.revision + 1
  const savedAt = new Date()
  try {
    await BusinessSettings.create({ _id: revision, settings: body.settings, savedAt, savedBy: actor.email })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
      return apiError(409, 'Settings changed. Reload before saving again.')
    }
    throw error
  }
  return Response.json({ revision, settings: body.settings, savedAt }, { headers: { 'Cache-Control': 'no-store' } })
})
