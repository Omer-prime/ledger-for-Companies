import { Schema, model, models, type Model } from 'mongoose'
import type { Role } from '@/lib/auth'

export interface IUser {
  name?: string
  email: string
  role: Role
  password: string                // NOTE: plain for MVP; replace with bcrypt later
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IUser>({
  name: { type: String },
  email: { type: String, unique: true, required: true, trim: true, lowercase: true },
  role: { type: String, required: true },
  password: { type: String, required: true },
}, { timestamps: true })

export const User: Model<IUser> = models.User || model<IUser>('User', schema)
