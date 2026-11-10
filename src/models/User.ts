import { Schema, model, models, type Model } from 'mongoose'
import { ROLES, type Role } from '@/lib/roles'

export interface IUser {
  name?: string
  email: string
  role: Role
  passwordHash?: string
  disabled?: boolean
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IUser>({
  name: String,
  email: { type: String, unique: true, required: true, trim: true, lowercase: true },
  role: { type: String, enum: [...ROLES], required: true },
  passwordHash: { type: String, required: true, select: false },
  disabled: { type: Boolean, default: false },
}, { timestamps: true })

export const User: Model<IUser> = models.User || model<IUser>('User', schema)
