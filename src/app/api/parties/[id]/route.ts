import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import mongoose from 'mongoose'

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await dbConnect()

  const { id } = await ctx.params // ⬅️ must await in Next 15
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }

  await Account.deleteOne({ _id: id, type: 'party' })
  return NextResponse.json({ ok: true })
}
