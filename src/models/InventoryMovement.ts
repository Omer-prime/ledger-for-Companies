import { Schema, model, models, Types, type InferSchemaType } from 'mongoose'

const movementSchema = new Schema(
  {
    // include 'opening'
    type: {
      type: String,
      enum: ['opening', 'purchase', 'sale', 'waste', 'adjustment'],
      required: true,
    },
    date: { type: Date, required: true, index: true },
    partyId: { type: Schema.Types.ObjectId, ref: 'Party' },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    qty: { type: Number, required: true, min: 0 },
    rate: { type: Number },      // opening avg cost or purchase unit cost
    sellRate: { type: Number },  // optional sale price
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

movementSchema.index({ productId: 1, date: 1, createdAt: 1 })

export type InventoryMovementDoc = InferSchemaType<typeof movementSchema>

// Create the model once, then export both named and default so either import style works.
const InventoryMovementModel =
  models.InventoryMovement || model('InventoryMovement', movementSchema)

export const InventoryMovement = InventoryMovementModel   // named export
export default InventoryMovementModel                     // default export

export const isObjectId = (s: string): boolean => {
  try { void new Types.ObjectId(s); return true } catch { return false }
}
