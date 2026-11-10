import { Account } from '@/models/Account'
import { dbConnect } from '@/lib/db'
import { digest } from '@/lib/auth'
import { reverseJournalLines, validateJournalLines, type JournalLine } from '@/lib/journal-lines'

type Posting = {
  sourceEventId: string
  actor: string
  reason: string
  lines: JournalLine[]
  reverses?: string
}

// Internal foundation. Legacy Transaction records are never read or rewritten here.
export async function postJournal(posting: Posting) {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(posting.sourceEventId) || !posting.actor.trim() || !posting.reason.trim()) {
    throw new Error('Missing journal audit information')
  }
  const connection = (await dbConnect()).connection
  const entries = connection.collection<Posting & { _id: string; fingerprint: string; postedAt: Date; currency: 'PKR' }>('journal_entries')
  const reversals = connection.collection<{ _id: string; reversalEventId: string }>('journal_reversals')
  const postedAt = new Date()
  return connection.transaction(async session => {
    let lines = posting.lines
    if (posting.reverses) {
      const original = await entries.findOne({ _id: posting.reverses }, { session })
      if (!original || original.reverses) throw new Error('Original journal is unavailable')
      lines = reverseJournalLines(original.lines)
    }
    validateJournalLines(lines)
    const fingerprint = digest(JSON.stringify([posting.actor, posting.reason, posting.reverses, lines]))
    const prior = await entries.findOne({ _id: posting.sourceEventId }, { session })
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('Journal idempotency conflict')
      return prior
    }
    const accountIds = [...new Set(lines.map(line => line.accountId))]
    if (!posting.reverses && await Account.countDocuments({
      _id: { $in: accountIds }, type: 'gl', archivedAt: null,
    }).session(session) !== accountIds.length) throw new Error('Unknown or archived journal account')
    if (posting.reverses) {
      await reversals.insertOne({ _id: posting.reverses, reversalEventId: posting.sourceEventId }, { session })
    }
    const entry = { ...posting, _id: posting.sourceEventId, fingerprint, lines, postedAt, currency: 'PKR' as const }
    await entries.insertOne(entry, { session })
    return entry
  })
}
