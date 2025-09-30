import { Schema, model, models, type Model, type Types } from 'mongoose'


export interface ITransaction {
account: Types.ObjectId
date: Date
voucherNo?: string
description?: string
debit?: number
credit?: number
meta?: Record<string, unknown> // user custom columns
createdAt: Date
updatedAt: Date
}


const TxSchema = new Schema<ITransaction>({
account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
date: { type: Date, required: true },
voucherNo: { type: String },
description: { type: String },
debit: { type: Number, default: 0 },
credit: { type: Number, default: 0 },
meta: { type: Object },
}, { timestamps: true })


TxSchema.index({ account: 1, date: 1 })


export const Transaction: Model<ITransaction> = models.Transaction || model<ITransaction>('Transaction', TxSchema)