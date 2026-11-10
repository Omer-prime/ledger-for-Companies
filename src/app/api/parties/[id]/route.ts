import { requirePermission, safeApi } from '@/lib/api-security'
import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import mongoose from 'mongoose'

export const DELETE = safeApi(async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission('configure', _req)
  if (denied) return denied
  await dbConnect()

  const { id } = await ctx.params // ⬅️ must await in Next 15
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }

  await Account.updateOne({ _id: id, type: 'party', archivedAt: null }, { $set: { archivedAt: new Date() } })
  return NextResponse.json({ ok: true })
})
