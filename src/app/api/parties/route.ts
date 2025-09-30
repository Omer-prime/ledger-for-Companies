import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account, type IAccount } from '@/models/Account'
import type { FilterQuery } from 'mongoose'

export async function GET(req: Request) {
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const query: FilterQuery<IAccount> = { type: 'party' }
  if (q) query.name = { $regex: q, $options: 'i' }
  const list = await Account.find(query).sort({ name: 1 }).limit(q ? 20 : 200).lean()
  return NextResponse.json(list)
}

export async function POST(req: Request) {
  await dbConnect()
  const { name, code } = await req.json()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const created = await Account.create({ name, code, type: 'party' })
  return NextResponse.json(created, { status: 201 })
}
