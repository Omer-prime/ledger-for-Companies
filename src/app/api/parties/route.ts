import { apiError, text, readBody, requirePermission, validateQuery, safeApi } from '@/lib/api-security'
import { NextRequest, NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const kind = z.enum(['customer', 'supplier', 'processor'])
// Optional kind retains compatibility with all existing POS/legacy party creation calls.
const contactInput = z.strictObject({ name: text.min(1), code: text.optional(), kind: kind.optional(), phone: text.max(40).optional(), address: text.optional() })
function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export const GET = safeApi(async function GET(req: NextRequest) {
  const denied = await requirePermission('read')
  if (denied) return denied
  if (!validateQuery(req)) return apiError(400, 'Invalid query')
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const limitRaw = Number(searchParams.get('limit') || '300')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 300

  const filter: Record<string, unknown> = { type: { $in: ['party', 'supplier', 'customer'] }, archivedAt: null }
  if (q) {
    const escaped = escapeRegex(q)
    filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { code: { $regex: escaped, $options: 'i' } }]
  }

  const docs = await Account.find(filter)
    .select('_id name code meta type')
    .sort({ name: 1, _id: 1 })
    .limit(limit)
    .lean()

  const data = docs.map((doc) => {
    const storedKind = doc.meta?.partyKind
    return {
      _id: String(doc._id), name: doc.name, code: doc.code ?? '',
      kind: kind.safeParse(storedKind).success ? storedKind : doc.type === 'party' ? 'general' : doc.type,
      phone: typeof doc.meta?.phone === 'string' ? doc.meta.phone : '',
      address: typeof doc.meta?.address === 'string' ? doc.meta.address : '',
    }
  })
  return NextResponse.json(data)
})

export const POST = safeApi(async function POST(req: NextRequest) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
  await dbConnect()
  const body = await readBody(req, contactInput)
  if (!body) return apiError(400, 'Invalid contact details')

  // Persist account.type=party for existing warehouse/POS/ledger compatibility.
  // Categorization is additive metadata, never a migration of existing balances.
  const created = await Account.create({
    name: body.name.trim(),
    ...(body.code ? { code: body.code.trim() } : {}),
    type: 'party',
    meta: { partyKind: body.kind, phone: body.phone, address: body.address },
  })
  return NextResponse.json({
    _id: String(created._id), name: created.name, code: created.code ?? '', kind: body.kind ?? 'general',
  }, { status: 201 })
})
