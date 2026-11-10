import { z } from 'zod'

export const LENGTH_UNITS_UM = { m: 1_000_000, yd: 914_400 } as const
const label = z.string().trim().min(1).max(100)
const code = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_-]{0,23}$/)
const note = z.string().trim().max(500)
const optionalUrl = z.union([z.literal(''), z.url({ protocol: /^https$/ }).max(400)])
const currency = z.string().trim().toUpperCase().refine(value => Intl.supportedValuesOf('currency').includes(value), 'Unknown currency')
const timeZone = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_+/\-]*$/).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
}, 'Unknown time zone')
const positiveInt = z.number().int().min(1)
const percent = z.number().min(0).max(100)
const grade = z.strictObject({ code, label, enabled: z.boolean() })
const method = z.strictObject({ code, label, enabled: z.boolean() })
const uniqueCodes = (items: { code: string }[]) => new Set(items.map(item => item.code)).size === items.length

export const businessSettingsSchema = z.strictObject({
  profile: z.strictObject({
    name: label, logoUrl: optionalUrl, address: note,
    email: z.union([z.literal(''), z.email().max(254)]),
    phone: z.string().trim().regex(/^[0-9+(). -]{0,32}$/),
    alternatePhone: z.string().trim().regex(/^[0-9+(). -]{0,32}$/),
    taxInformation: note,
  }),
  localization: z.strictObject({
    currency, timeZone, dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
  }),
  measurements: z.strictObject({
    lengthUnit: z.enum(['m', 'yd']), countUnit: z.enum(['piece', 'suit', 'bundle']),
    piecesPerSuit: positiveInt.max(1000), piecesPerBundle: positiveInt.max(100000),
  }),
  grades: z.array(grade).min(3).max(30)
    .refine(items => uniqueCodes(items) && ['A', 'B', 'C'].every(code => items.some(item => item.code === code)), 'Keep unique A, B and C grade codes'),
  textile: z.strictObject({
    fabricType: label, color: label, cuttingLossPercent: percent,
    dyeingLossPercent: percent, packingConvention: note,
  }),
  thaan: z.strictObject({
    suitsPerThaan: positiveInt.max(1000),
    metersPerSuit: z.number().gt(0).max(10000)
      .refine(value => Math.round(value * LENGTH_UNITS_UM.m) / LENGTH_UNITS_UM.m === value, 'Use at most six decimal places'),
  }),
  invoice: z.strictObject({
    prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{0,24}$/),
    startingNumber: positiveInt.max(999999999), digits: positiveInt.max(12),
    header: note, footer: note,
    paperSize: z.enum(['A4', 'LETTER', 'RECEIPT_80MM']),
    copies: positiveInt.max(5), showLogo: z.boolean(),
  }),
  paymentMethods: z.array(method).min(2).max(30).refine(items =>
    uniqueCodes(items) && ['CASH', 'BANK'].every(code => items.some(item => item.code === code)) &&
    items.some(item => item.enabled), 'Keep unique cash and bank codes and enable at least one method'),
  terminology: z.strictObject({
    product: label, customer: label, supplier: label, bundle: label,
    sale: label, purchase: label, inventory: label,
  }),
})

export type BusinessSettingsData = z.infer<typeof businessSettingsSchema>

export const defaultBusinessSettings: BusinessSettingsData = {
  profile: { name: 'Your business', logoUrl: '', address: '', email: '', phone: '', alternatePhone: '', taxInformation: '' },
  localization: { currency: 'PKR', timeZone: 'Asia/Karachi', dateFormat: 'DD/MM/YYYY' },
  measurements: { lengthUnit: 'm', countUnit: 'piece', piecesPerSuit: 1, piecesPerBundle: 1 },
  grades: ['A', 'B', 'C'].map(code => ({ code, label: 'Grade ' + code, enabled: true })),
  textile: { fabricType: 'Unspecified', color: 'Unspecified', cuttingLossPercent: 0, dyeingLossPercent: 0, packingConvention: '' },
  thaan: { suitsPerThaan: 4, metersPerSuit: 6 },
  invoice: { prefix: 'INV-', startingNumber: 1, digits: 6, header: '', footer: '', paperSize: 'A4', copies: 1, showLogo: true },
  paymentMethods: [{ code: 'CASH', label: 'Cash', enabled: true }, { code: 'BANK', label: 'Bank transfer', enabled: true }],
  terminology: { product: 'Product', customer: 'Customer', supplier: 'Supplier', bundle: 'Bundle', sale: 'Sale', purchase: 'Purchase', inventory: 'Inventory' },
}

export function thaanLengthMicrometers(settings: BusinessSettingsData['thaan']) {
  return Math.round(settings.metersPerSuit * LENGTH_UNITS_UM.m) * settings.suitsPerThaan
}

export function countInPieces(quantity: number, unit: 'piece' | 'suit' | 'bundle', settings: BusinessSettingsData['measurements']) {
  const pieces = quantity * ({ piece: 1, suit: settings.piecesPerSuit, bundle: settings.piecesPerBundle })[unit]
  if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(pieces) || pieces < 0) {
    throw new RangeError('Invalid inventory count')
  }
  return pieces
}
