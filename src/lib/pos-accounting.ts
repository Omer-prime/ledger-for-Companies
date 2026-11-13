import { z } from 'zod'
import type { Connection } from 'mongoose'

export const mappingKeys = ['cash', 'bank', 'receivables', 'revenue', 'finishedInventory', 'cogs'] as const
const account = z.string().regex(/^[a-f0-9]{24}$/)
export const approvalSchema = z.strictObject({
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  approval: z.strictObject({
    accounts: z.strictObject({ cash: account, bank: account, receivables: account, revenue: account, finishedInventory: account, cogs: account }),
    policy: z.literal('raw-material-length-v1'),
    businessApprovalReference: z.string().trim().min(3).max(200),
    capitalizedOrderIds: z.array(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/)).max(1000)
      .refine(values => new Set(values).size === values.length),
    capitalizedOpeningIds: z.array(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/)).max(500)
      .refine(values => new Set(values).size === values.length).optional(),
    reconciledAndCapitalized: z.literal(true),
    noTaxDiscountsOrReturns: z.literal(true),
  }).nullable(),
})

export type PosApproval = NonNullable<z.infer<typeof approvalSchema>['approval']>
export function posAccounting(connection: Connection) {
  return connection.collection<{ _id: number; approval: PosApproval | null; actor: string; approvedAt: Date }>('pos_accounting_revisions')
}
