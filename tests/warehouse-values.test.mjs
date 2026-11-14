import test from 'node:test'
import assert from 'node:assert/strict'
import { integralMongoDecimal, formatMicrometers, pkrToMinorPerMeter, formatValuationPKR } from '../src/lib/warehouse-values.ts'

test('MongoDB Decimal128 whole-number strings do not crash warehouse dashboard', () => {
  assert.equal(integralMongoDecimal('10000000000.0000'), 10000000000n)
  assert.equal(formatMicrometers('10000000000.0000'), '10,000')
  assert.equal(formatMicrometers('1234567.000000'), '1.234567')
  assert.throws(() => integralMongoDecimal('1000.5'), /integral/)
})

test('Operator cost is in PKR, stored as exact paisa (without floating-point rounding)', () => {
  assert.equal(pkrToMinorPerMeter('300'), 30000)
  assert.equal(pkrToMinorPerMeter('300.50'), 30050)
  assert.equal(pkrToMinorPerMeter('0.01'), 1)
  assert.throws(() => pkrToMinorPerMeter('300.999'), /Cost must/)
  assert.throws(() => pkrToMinorPerMeter('-1'), /Cost must/)
  assert.throws(() => pkrToMinorPerMeter('10000000.01'), /maximum/)
})

test('Stage valuation is displayed as rupees with two decimal places', () => {
  // 100 m * Rs 300 / m => 30,000 PKR.
  assert.equal(formatValuationPKR('3000000000000.0000'), '30,000.00')
  // Half meter * Rs 300 / m => 150 PKR.
  assert.equal(formatValuationPKR('15000000000.0000'), '150.00')
  assert.equal(formatValuationPKR('0.0000'), '0.00')
})

test('Decimal128 scientific notation preserves exact integers', () => {
  assert.equal(integralMongoDecimal('1.2300E+5'), BigInt(123000))
  assert.equal(integralMongoDecimal('1200E-2'), BigInt(12))
  assert.throws(() => integralMongoDecimal('1201E-2'))
})
