import { z } from 'zod'

export const stockRef = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/)
export const stockRow = z.strictObject({
  identifier: stockRef, kind: z.enum(['full', 'partial', 'loose']), fabric: z.string().trim().min(1).max(120),
  design: z.string().trim().max(120), size: z.string().trim().max(60),
  grade: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,24}$/),
  suits: z.number().int().min(1).max(1000),
  suitLengthUm: z.number().int().min(1).max(100_000_000),
  costPaisa: z.number().int().min(1).max(100_000_000_000).optional(),
  sellingPricePaisa: z.number().int().min(1).max(100_000_000_000).optional(),
  source: z.string().trim().min(1).max(200), evidence: z.string().trim().max(200),
})
export const openingCommand = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('import'), reference: stockRef, countDate: z.iso.date(), rows: z.array(stockRow).min(1).max(100), preview: z.boolean().optional() }),
  z.strictObject({ action: z.literal('verify'), reference: stockRef, verificationReference: z.string().trim().min(3).max(200), costs: z.array(z.strictObject({ identifier: stockRef, costPaisa: z.number().int().min(1).max(100_000_000_000) })).max(100).optional() }),
])
export type OpeningOrigin = { version: 1; reference: string; kind: 'full' | 'partial' | 'loose'; fabric: string; design: string; size: string; costPaisa?: number; sellingPricePaisa?: number; source: string; evidence: string; countDate: string; currency: 'PKR' }
