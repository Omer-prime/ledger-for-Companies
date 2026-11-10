export type JournalLine = { accountId: string; debitPaisa: number; creditPaisa: number }

export function validateJournalLines(lines: readonly JournalLine[]) {
  if (lines.length < 2 || lines.length > 500) throw new Error('Invalid journal line count')
  let debit = BigInt(0)
  let credit = BigInt(0)
  for (const line of lines) {
    const { debitPaisa, creditPaisa } = line
    if (!/^[a-f0-9]{24}$/.test(line.accountId) || !Number.isSafeInteger(debitPaisa) ||
        !Number.isSafeInteger(creditPaisa) || debitPaisa < 0 || creditPaisa < 0 ||
        (debitPaisa === 0) === (creditPaisa === 0)) {
      throw new Error('Invalid journal line')
    }
    debit += BigInt(debitPaisa)
    credit += BigInt(creditPaisa)
  }
  if (debit !== credit) throw new Error('Unbalanced journal')
}

export function reverseJournalLines(lines: readonly JournalLine[]): JournalLine[] {
  validateJournalLines(lines)
  return lines.map(({ accountId, debitPaisa, creditPaisa }) => ({
    accountId, debitPaisa: creditPaisa, creditPaisa: debitPaisa,
  }))
}
