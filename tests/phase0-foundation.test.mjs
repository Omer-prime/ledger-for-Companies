import assert from 'node:assert/strict'
import test from 'node:test'
import { businessDateRange } from '../src/lib/business-dates.ts'
import { reverseJournalLines, validateJournalLines } from '../src/lib/journal-lines.ts'

test('journal rejects unbalanced and unsafe postings and reverses integer paisa', () => {
  const lines = [
    { accountId: 'a'.repeat(24), debitPaisa: 125, creditPaisa: 0 },
    { accountId: 'b'.repeat(24), debitPaisa: 0, creditPaisa: 125 },
  ]
  assert.doesNotThrow(() => validateJournalLines(lines))
  assert.throws(() => validateJournalLines([lines[0], { ...lines[1], creditPaisa: 124 }]), /Unbalanced/)
  assert.throws(() => validateJournalLines([lines[0], { ...lines[1], creditPaisa: 125.5 }]), /Invalid/)
  assert.deepEqual(reverseJournalLines(reverseJournalLines(lines)), lines)
})

test('business-day boundaries handle Pakistan and DST', () => {
  const pakistan = businessDateRange('2026-11-10', '2026-11-10', 'Asia/Karachi')
  assert.equal(pakistan.start.toISOString(), '2026-11-09T19:00:00.000Z')
  assert.equal(pakistan.end.toISOString(), '2026-11-10T19:00:00.000Z')
  const dst = businessDateRange('2026-03-08', '2026-03-08', 'America/New_York')
  assert.equal(dst.end - dst.start, 23 * 60 * 60 * 1000)
})
