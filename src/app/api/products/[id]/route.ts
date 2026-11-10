import { requirePermission } from '@/lib/api-security'
import { NextResponse, type NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const denied = await requirePermission('deleteProduct', _req)
  if (denied) return denied
  await dbConnect()
  const { id } = await context.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }

  await Account.deleteOne({ _id: id, type: 'product' })
  return NextResponse.json({ ok: true })
}
