// src/app/api/categories/[id]/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { dbConnect } from '@/lib/db'
import { LedgerCategory } from '@/models/LedgerCategory'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await dbConnect()
  const { id } = await ctx.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }

  const deleted = await LedgerCategory.findByIdAndDelete(id)
  return NextResponse.json({ ok: true, deleted: !!deleted })
}
