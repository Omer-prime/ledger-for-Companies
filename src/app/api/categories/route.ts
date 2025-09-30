import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { LedgerCategory } from '@/models/LedgerCategory'

export async function GET() {
  await dbConnect()
  const list = await LedgerCategory.find().sort({ name: 1 }).lean()
  return NextResponse.json(list)
}

export async function POST(req: Request) {
  await dbConnect()
  const { name } = await req.json()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

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
