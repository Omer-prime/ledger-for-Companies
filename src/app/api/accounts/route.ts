import { amount, apiError, readBody, requirePermission, text } from '@/lib/api-security'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'


export async function GET() {
  const denied = await requirePermission('read')
  if (denied) return denied
await dbConnect()
const list = await Account.find({}).sort({ name: 1 }).lean()
return NextResponse.json(list)
}


export async function POST(req: Request) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
await dbConnect()
const body = await readBody(req, z.strictObject({
  name: text.min(1), code: text.optional(),
  type: z.enum(['customer', 'supplier', 'bank', 'product', 'category', 'gl', 'party']),
  openingBalance: amount.optional(), openingIsDebit: z.boolean().optional(),
}))
if (!body) return apiError(400, 'Invalid account payload')
const created = await Account.create(body)
return NextResponse.json(created, { status: 201 })
}