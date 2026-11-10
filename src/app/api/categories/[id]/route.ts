import { requirePermission, safeApi } from '@/lib/api-security'
// src/app/api/categories/[id]/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { dbConnect } from '@/lib/db'
import { LedgerCategory } from '@/models/LedgerCategory'

export const DELETE = safeApi(async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission('configure', _req)
  if (denied) return denied
  await dbConnect()
  const { id } = await ctx.params

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }

  const deleted = await LedgerCategory.updateOne({ _id: id, archivedAt: null }, { $set: { archivedAt: new Date() } })
  return NextResponse.json({ ok: true, deleted: deleted.modifiedCount > 0 })
})
