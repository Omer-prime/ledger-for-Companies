import { Schema, model, models, type Model } from 'mongoose'

export type AccountType =
  'customer' | 'supplier' | 'bank' | 'product' | 'category' | 'gl' | 'party'

export interface IAccount {
  name: string
  code?: string
  type: AccountType
  openingBalance?: number
  openingIsDebit?: boolean
  meta?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

const AccountSchema = new Schema<IAccount>({
  name: { type: String, required: true, trim: true },
  code: { type: String, unique: false, sparse: true },
  type: { type: String, required: true },
  openingBalance: { type: Number, default: 0 },
  openingIsDebit: { type: Boolean, default: true },
  meta: { type: Object },
}, { timestamps: true })

export const Account: Model<IAccount> = models.Account || model<IAccount>('Account', AccountSchema)
