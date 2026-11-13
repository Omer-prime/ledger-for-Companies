import test from 'node:test'
import assert from 'node:assert/strict'
import {code128Bars,code128Width} from '../src/lib/code128.ts'
test('Code128-B generates bars with a valid width and rejects invalid label values',()=>{
  const bars=code128Bars('THAAN-A001')
  assert.ok(bars.length>30)
  assert.ok(code128Width('THAAN-A001')>100)
  assert.equal(bars[0].x,0)
  assert.throws(()=>code128Bars(''),/Barcode/)
  assert.throws(()=>code128Bars('Å'),/Barcode/)
})
