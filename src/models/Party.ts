import mongoose, { Schema, Model, InferSchemaType } from 'mongoose'

const PartySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
  },
  { timestamps: true }
)

export type PartyDoc = InferSchemaType<typeof PartySchema> & { _id: mongoose.Types.ObjectId }

const Party: Model<PartyDoc> = mongoose.models.Party || mongoose.model('Party', PartySchema)
export default Party
