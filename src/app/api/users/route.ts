import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { User } from '@/models/User'
import { getSession } from '@/lib/auth'

export async function GET() {
  await dbConnect()
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const list = await User.find({}, { password: 0 }).sort({ createdAt: -1 }).lean()
  return NextResponse.json(list)
}

export async function POST(req: Request) {
  await dbConnect()
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Only superadmin/admin can create members
  if (!['superadmin', 'admin'].includes(me.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const created = await User.create(body)
  const safe = { _id: created._id, name: created.name, email: created.email, role: created.role, createdAt: created.createdAt, updatedAt: created.updatedAt }
  return NextResponse.json(safe, { status: 201 })
}
