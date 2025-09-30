import { NextResponse, type NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import { getSession } from '@/lib/auth'

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
  // Only superadmin can delete products (as requested)
  if (!me || me.role !== 'superadmin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  await Account.deleteOne({ _id: id, type: 'product' })
  return NextResponse.json({ ok: true })
}
