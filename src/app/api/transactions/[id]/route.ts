import { NextResponse, type NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { dbConnect } from '@/lib/db'
import { Transaction } from '@/models/Transaction'
import { getSession } from '@/lib/auth'

type PatchBody = Partial<{
  date: string
  voucherNo: string
  description: string
  debit: number
  credit: number
  account: string
  meta: Record<string, unknown>
}>

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await dbConnect()
  const { id } = await context.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }

  const body = (await req.json()) as PatchBody

  const updates: Record<string, unknown> = {}
  const allowed: (keyof PatchBody)[] = [
    'date',
    'voucherNo',
    'description',
    'debit',
    'credit',
    'account',
    'meta',
  ]

  for (const k of allowed) {
    const v = body[k]
    if (v === undefined) continue
    if (k === 'date' && typeof v === 'string') {
      updates.date = new Date(v)
    } else if (k === 'account' && typeof v === 'string' && mongoose.Types.ObjectId.isValid(v)) {
      updates.account = new mongoose.Types.ObjectId(v)
    } else {
      updates[k] = v
    }
  }

  const doc = await Transaction.findByIdAndUpdate(id, updates, { new: true }).lean()
  return NextResponse.json(doc)
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await dbConnect()
  const { id } = await context.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }

  const me = await getSession()
  // Only admin or superadmin can delete transactions (reports)
  if (!me || (me.role !== 'admin' && me.role !== 'superadmin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  await Transaction.findByIdAndDelete(id)
  return NextResponse.json({ ok: true })
}
