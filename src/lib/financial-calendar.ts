import { DEFAULT_TZ } from '@/lib/finance-metrics'

/** Interpret a validated calendar date in the reporting timezone, including DST. */
export function financialDayBoundary(value: string, end = false, timeZone = DEFAULT_TZ): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must use YYYY-MM-DD')
  const utc = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) throw new Error('Invalid date')
  const target = utc.getTime() + (end ? 86_400_000 : 0)
  const format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  let guess = target
  for (let i = 0; i < 4; i++) {
    const parts = format.formatToParts(new Date(guess))
    const part = (name: string) => Number(parts.find(entry => entry.type === name)!.value)
    const local = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
    const delta = target - local
    guess += delta
    if (!delta) break
  }
  return new Date(guess - (end ? 1 : 0))
}
