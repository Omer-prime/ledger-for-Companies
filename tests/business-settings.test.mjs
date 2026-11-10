import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  businessSettingsSchema, countInPieces, defaultBusinessSettings, LENGTH_UNITS_UM, thaanLengthMicrometers,
} from '../src/lib/business-settings.ts'

test('business settings validate defaults, demo configuration and canonical units', async () => {
  const demo = JSON.parse(await readFile(new URL('./fixtures/business-settings-demo.json', import.meta.url), 'utf8'))
  assert.equal(businessSettingsSchema.safeParse(defaultBusinessSettings).success, true)
  assert.equal(businessSettingsSchema.safeParse(demo).success, true)
  assert.equal(LENGTH_UNITS_UM.yd, 914400)
  assert.equal(thaanLengthMicrometers(demo.thaan), 24000000)
  assert.equal(countInPieces(2, 'bundle', demo.measurements), 24)
  assert.throws(() => countInPieces(1.5, 'suit', demo.measurements), RangeError)
})

test('business settings reject unknown keys, invalid formats and conflicting codes', () => {
  const validate = value => businessSettingsSchema.safeParse(value).success
  const settings = defaultBusinessSettings
  assert.equal(validate({ ...settings, tenant: 'other' }), false)
  assert.equal(validate({ ...settings, localization: { ...settings.localization, currency: 'ZZZ' } }), false)
  assert.equal(validate({ ...settings, localization: { ...settings.localization, timeZone: 'Invalid/Zone' } }), false)
  assert.equal(validate({ ...settings, profile: { ...settings.profile, logoUrl: 'http://example.test/logo' } }), false)
  assert.equal(validate({ ...settings, thaan: { ...settings.thaan, metersPerSuit: 1.0000001 } }), false)
  assert.equal(validate({ ...settings, grades: [...settings.grades, { code: 'a', label: 'Duplicate', enabled: true }] }), false)
  assert.equal(validate({ ...settings, paymentMethods: settings.paymentMethods.map(method => ({ ...method, enabled: false })) }), false)
})
