import mongoose, { Schema, type Model } from 'mongoose'
import type { BusinessSettingsData } from '@/lib/business-settings'

type BusinessSettingsRevision = {
  _id: number
  settings: BusinessSettingsData
  savedAt: Date
  savedBy: string
}

const schema = new Schema<BusinessSettingsRevision>({
  _id: { type: Number, required: true },
  settings: { type: Schema.Types.Mixed, required: true, immutable: true },
  savedAt: { type: Date, required: true, immutable: true },
  savedBy: { type: String, required: true, immutable: true },
}, { collection: 'business_settings', versionKey: false })

export const BusinessSettings: Model<BusinessSettingsRevision> =
  mongoose.models.BusinessSettings || mongoose.model('BusinessSettings', schema)
