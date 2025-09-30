import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'


export async function GET() {
await dbConnect()
const list = await Account.find({}).sort({ name: 1 }).lean()
return NextResponse.json(list)
}


export async function POST(req: Request) {
await dbConnect()
const body = await req.json()
const created = await Account.create(body)
return NextResponse.json(created, { status: 201 })
}