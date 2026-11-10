import { apiError, named, readBody, requirePermission } from '@/lib/api-security'
import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { LedgerCategory } from '@/models/LedgerCategory'

export async function GET() {
  const denied = await requirePermission('read')
  if (denied) return denied
  await dbConnect()
  const list = await LedgerCategory.find().sort({ name: 1 }).lean()
  return NextResponse.json(list)
}

export async function POST(req: Request) {
  const denied = await requirePermission('configure', req)
  if (denied) return denied
  await dbConnect()
  const body = await readBody(req, named)
  if (!body) return apiError(400, 'Invalid payload')
  const { name } = body

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const created = await LedgerCategory.create({
    name,
    slug,
    defaultColumns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'debit', label: 'Debit', type: 'number' },
      { key: 'credit', label: 'Credit', type: 'number' },
    ],
  })
  return NextResponse.json(created, { status: 201 })
}
