export function toCSV<T extends Record<string, unknown>>(
  rows: T[],
  headers: { key: keyof T; label: string }[]
) {
  const esc = (v: unknown) => String(v ?? '').replaceAll('"', '""')
  const head = headers.map(h => `"${esc(h.label)}"`).join(',')
  const body = rows
    .map(r => headers.map(h => `"${esc(r[h.key])}"`).join(','))
    .join('\n')
  return head + '\n' + body
}
