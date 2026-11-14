import { validateJournalLines, type JournalLine } from '@/lib/journal-lines'

type Accounts = Record<'cash' | 'bank' | 'receivables' | 'revenue' | 'finishedInventory' | 'cogs', string>

// Cumulative rounding assigns the same total paisa whether the thaan sells in one or several documents.
export function rawMaterialCost(rate: number, suitUm: number, soldBefore: number, soldNow: number) {
  if (![rate, suitUm, soldBefore, soldNow].every(Number.isSafeInteger) || rate <= 0 || suitUm <= 0 || soldBefore < 0 || soldNow <= 0) {
    throw new Error('Verified positive PKR cost and exact suit length are required')
  }
  const numerator = BigInt(rate) * BigInt(suitUm)
  const rounded = (count: bigint) => (numerator * count + BigInt(500000)) / BigInt(1000000)
  const cost = Number(rounded(BigInt(soldBefore) + BigInt(soldNow)) - rounded(BigInt(soldBefore)))
  if (!Number.isSafeInteger(cost)) throw new Error('Stock cost exceeds safe paisa range')
  return cost
}

export function checkoutJournal(accounts: Accounts, kind: 'sale' | 'payment', total: number, paid: number, method: 'cash' | 'bank' | undefined, cost: number) {
  if (![total, paid, cost].every(value => Number.isSafeInteger(value) && value >= 0) ||
      (paid > 0 && !method) || (kind === 'sale' ? total === 0 || paid > total : total !== 0 || cost !== 0 || paid === 0)) {
    throw new Error('Invalid checkout journal amounts')
  }
  const lines: JournalLine[] = []
  const add = (key: keyof Accounts, debitPaisa: number, creditPaisa: number) => {
    if (debitPaisa || creditPaisa) lines.push({ accountId: accounts[key], debitPaisa, creditPaisa })
  }
  if (method) add(method, paid * 100, 0)
  if (kind === 'payment') add('receivables', 0, paid * 100)
  else {
    add('receivables', (total - paid) * 100, 0)
    add('revenue', 0, total * 100)
    add('cogs', cost, 0)
    add('finishedInventory', 0, cost)
  }
  validateJournalLines(lines)
  return lines
}
