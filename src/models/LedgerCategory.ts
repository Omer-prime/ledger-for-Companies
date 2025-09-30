import { Schema, model, models, type Model } from 'mongoose'

export interface ILedgerCategory {
  name: string
  slug: string
  defaultColumns?: Array<{ key: string; label: string; type: 'text'|'number'|'date' }>
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<ILedgerCategory>({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  defaultColumns: { type: Array }
}, { timestamps: true })

export const LedgerCategory: Model<ILedgerCategory> =
  models.LedgerCategory || model<ILedgerCategory>('LedgerCategory', schema)
