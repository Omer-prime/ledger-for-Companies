import { Schema, model, models, type InferSchemaType } from 'mongoose'

const productSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    code: { type: String, default: '' }
  },
  { timestamps: true }
)

export type ProductDoc = InferSchemaType<typeof productSchema>
export const Product = models.Product || model('Product', productSchema)
