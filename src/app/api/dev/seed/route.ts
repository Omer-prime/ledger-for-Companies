import { NextResponse } from 'next/server'
import { dbConnect } from '@/lib/db'
import { Account } from '@/models/Account'
import { Transaction } from '@/models/Transaction'


export async function POST() {
await dbConnect()
await Account.deleteMany({})
await Transaction.deleteMany({})
const party = await Account.create({ name: 'Babar Madina Enterprises', type: 'customer', openingBalance: 500000, openingIsDebit: true })
const now = new Date()
await Transaction.create([
{ account: party._id, date: new Date(now.getFullYear(), now.getMonth(), 1), voucherNo: 'V-001', description: 'Cash paid', debit: 0, credit: 100000 },
{ account: party._id, date: new Date(now.getFullYear(), now.getMonth(), 2), voucherNo: 'V-002', description: 'Sale', debit: 150000, credit: 0 },
{ account: party._id, date: new Date(now.getFullYear(), now.getMonth(), 2), voucherNo: 'V-003', description: 'Tax', debit: 0, credit: 7500 },
])
return NextResponse.json({ ok: true })
}