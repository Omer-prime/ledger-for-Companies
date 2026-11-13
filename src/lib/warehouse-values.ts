/** Warehouse quantities and valuations are stored as integer micrometers and paisa. */
export function integralMongoDecimal(value: number | string | bigint): bigint {
  const raw = String(value).trim()
  // Decimal128 aggregations can stringify a whole number as "1000000.0000".
  // Never pass that representation directly to BigInt, and reject actual fractions.
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(raw)
  if (!match) throw new Error('Invalid integral warehouse quantity')
  const [, sign, whole, fraction = '', exponent = '0'] = match
  const digits = (whole + fraction).replace(/^0+/, '')
  if (!digits) return BigInt(0)
  const shift = Number(exponent) - fraction.length
  if (!Number.isInteger(shift) || Math.abs(shift) > 6200) throw new Error('Invalid warehouse exponent')
  if (shift >= 0) return BigInt(sign + digits + '0'.repeat(shift))
  const split = digits.length + shift
  if (split <= 0 || /[^0]/.test(digits.slice(split))) throw new Error('Invalid integral warehouse quantity')
  return BigInt(sign + digits.slice(0, split))
}

export function formatMicrometers(value: number | string | bigint): string {
  const units = integralMongoDecimal(value)
  const negative = units < BigInt(0)
  const abs = negative ? -units : units
  const whole = abs / BigInt(1000000)
  const fraction = (abs % BigInt(1000000)).toString().padStart(6, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole.toLocaleString('en-PK')}${fraction ? '.' + fraction : ''}`
}

/** Receives rupee amount as written by the operator, and stores integer paisa. */
export function pkrToMinorPerMeter(input: string): number {
  const raw = input.trim()
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error('Cost must be in PKR, for example 300 or 300.50 (at most two decimal places).')
  }
  const [whole, decimals = ''] = raw.split('.')
  const paisa = BigInt(whole) * BigInt(100) + BigInt(decimals.padEnd(2, '0') || '0')
  // The existing warehouse API persists no more than 1,000,000,000 paisa/m.
  if (paisa > BigInt(1000000000)) throw new Error('Cost exceeds the maximum Rs 10,000,000 per meter.')
  return Number(paisa)
}

/** MongoDB stores sum(micrometers * paisa-per-meter); display rupees, rounded to paisa. */
export function formatValuationPKR(valueNumerator: number | string | bigint): string {
  const units = integralMongoDecimal(valueNumerator)
  const negative = units < BigInt(0)
  const abs = negative ? -units : units
  const paisa = (abs + BigInt(500000)) / BigInt(1000000)
  return `${negative ? '-' : ''}${(paisa / BigInt(100)).toLocaleString('en-PK')}.${(paisa % BigInt(100)).toString().padStart(2, '0')}`
}
