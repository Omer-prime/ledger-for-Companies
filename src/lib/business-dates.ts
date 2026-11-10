const DAY = 86_400_000

export function businessDayStart(day: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const nominal = new Date(day + 'T00:00:00Z').getTime()
  let low = nominal - 2 * DAY
  let high = nominal + 2 * DAY
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (formatter.format(middle) < day) low = middle + 1
    else high = middle
  }
  return new Date(low)
}

export function businessDateRange(from: string, to: string, timeZone = process.env.BUSINESS_TIME_ZONE || 'UTC') {
  const dayAfter = to ? new Date(new Date(to + 'T00:00:00Z').getTime() + DAY).toISOString().slice(0, 10) : ''
  return {
    start: from ? businessDayStart(from, timeZone) : null,
    end: dayAfter ? businessDayStart(dayAfter, timeZone) : null,
  }
}
