import assert from 'node:assert/strict'
import test from 'node:test'
import { metersToMicrometers, reconcileCutting } from '../src/lib/textile-quantities.ts'

test('cutting conserves exact micrometers across output and exceptions', () => {
  assert.equal(metersToMicrometers('0.000001'), 1)
  assert.throws(() => metersToMicrometers('0.0000001'), RangeError)
  assert.equal(reconcileCutting(180000000, 6000000, 29, 0, 0, 0, 6000000), 180000000)
  assert.equal(reconcileCutting(20000000, 6000000, 1, 1, 4000000, 3000000, 1000000), 16000000)
  assert.throws(() => reconcileCutting(180000000, 6000000, 29, 0, 0, 0, 5999999), RangeError)
})
