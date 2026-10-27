/**
 * Deterministic HR time calculations. This module has no database or financial
 * side effects: callers provide persisted schedule, leave, holiday, shift, and
 * approved-correction snapshots. All totals are integer minutes.
 */
export type HrScheduleDay = { weekday: number; restDay: boolean; startsAt?: string | null; endsAt?: string | null }
export type HrScheduleRevision = {
  effectiveFrom: Date | string; effectiveUntil?: Date | string | null; graceMinutes: number; days: readonly HrScheduleDay[]
}
export type HrAttendanceCorrection = {
  status: string; shiftId?: string | number | bigint | null; proposedOpenedAt?: Date | string | null; proposedClosedAt?: Date | string | null; decidedAt?: Date | string | null
}
export type HrShiftInterval = { id: string | number | bigint; openedAt: Date | string; closedAt?: Date | string | null }
export type HrLeaveInterval = { status: string; startsOn: Date | string; endsOn: Date | string; paid?: boolean }
export type HrHolidayInterval = { startsOn: Date | string; endsOn: Date | string }

export type HrDailyTimeSummary = {
  date: string; scheduledMinutes: number; actualMinutes: number; payableMinutes: number; missingMinutes: number
  lateMinutes: number; earlyDepartureMinutes: number; extraMinutes: number; restDayWorkMinutes: number; holidayWorkMinutes: number
  approvedLeaveMinutes: number; paidLeaveMinutes: number; leaveClassificationUnknown: boolean; holiday: boolean; overnightWorkMinutes: number
}
export type HrTimeSummary = {
  timezone: string; startsOn: string; endsOn: string; days: HrDailyTimeSummary[]
  totals: Omit<HrDailyTimeSummary, 'date' | 'holiday' | 'leaveClassificationUnknown'> & { leaveClassificationUnknown: boolean }
}

const DAY_MS = 86_400_000
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function asDate(value: Date | string): Date { const date = value instanceof Date ? new Date(value) : new Date(value); if (Number.isNaN(date.getTime())) throw new Error('Invalid HR date'); return date }
function dateKey(value: Date | string): string { return asDate(value).toISOString().slice(0, 10) }
function dateFromKey(value: string): Date { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid HR date key'); return new Date(`${value}T00:00:00.000Z`) }
function addDays(key: string, days: number) { return new Date(dateFromKey(key).getTime() + days * DAY_MS).toISOString().slice(0, 10) }
function minuteOfDay(value: string) { if (!timePattern.test(value)) throw new Error('Invalid HR time'); const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute }
function weekday(key: string) { return dateFromKey(key).getUTCDay() }

function localParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value)
  const field = (name: string) => parts.find((part) => part.type === name)?.value
  const year = field('year'), month = field('month'), day = field('day'), hour = field('hour'), minute = field('minute')
  if (!year || !month || !day || !hour || !minute) throw new Error('Unable to resolve HR timezone')
  return { key: `${year}-${month}-${day}`, minute: Number(hour) * 60 + Number(minute) }
}

/** Resolves a local midnight in the supplied IANA timezone without relying on host timezone. */
function localMidnight(key: string, timezone: string) {
  const base = dateFromKey(key).getTime(); let guess = base
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(guess), timezone)
    const offset = Date.UTC(Number(p.key.slice(0, 4)), Number(p.key.slice(5, 7)) - 1, Number(p.key.slice(8, 10)), Math.floor(p.minute / 60), p.minute % 60) - guess
    const next = base - offset
    if (next === guess) break
    guess = next
  }
  return guess
}

function intervalMinutesByDate(start: Date, end: Date, timezone: string, rangeStart: string, rangeEnd: string) {
  const values = new Map<string, number>(); if (end <= start) return values
  let cursor = Math.max(start.getTime(), localMidnight(rangeStart, timezone)); const limit = Math.min(end.getTime(), localMidnight(addDays(rangeEnd, 1), timezone))
  while (cursor < limit) {
    const key = localParts(new Date(cursor), timezone).key; const next = Math.min(limit, localMidnight(addDays(key, 1), timezone))
    // A timezone transition at midnight can make the next lookup equal cursor.
    const safeNext = next > cursor ? next : Math.min(limit, cursor + 60_000)
    values.set(key, (values.get(key) ?? 0) + Math.round((safeNext - cursor) / 60_000)); cursor = safeNext
  }
  return values
}

function effectiveSchedule(schedules: readonly HrScheduleRevision[], key: string) {
  const candidates = schedules.filter((schedule) => dateKey(schedule.effectiveFrom) <= key && (!schedule.effectiveUntil || key < dateKey(schedule.effectiveUntil)))
  if (candidates.length > 1) throw new Error(`Overlapping effective schedules for ${key}`)
  return candidates[0] ?? null
}

function scheduledMinutes(day: HrScheduleDay | undefined) {
  if (!day || day.restDay) return 0
  if (!day.startsAt || !day.endsAt) throw new Error('Working schedule day has no complete interval')
  const start = minuteOfDay(day.startsAt), end = minuteOfDay(day.endsAt)
  return end <= start ? end + 1440 - start : end - start
}

function correctionForShift(shift: HrShiftInterval, corrections: readonly HrAttendanceCorrection[]) {
  const id = String(shift.id); const approved = corrections.filter((item) => item.status === 'approved' && item.shiftId != null && String(item.shiftId) === id)
  if (approved.length > 1) throw new Error(`Contradictory approved attendance corrections for shift ${id}`)
  return approved[0] ?? null
}

function totals(days: readonly HrDailyTimeSummary[]): HrTimeSummary['totals'] {
  const initial = { scheduledMinutes: 0, actualMinutes: 0, payableMinutes: 0, missingMinutes: 0, lateMinutes: 0, earlyDepartureMinutes: 0, extraMinutes: 0, restDayWorkMinutes: 0, holidayWorkMinutes: 0, approvedLeaveMinutes: 0, paidLeaveMinutes: 0, overnightWorkMinutes: 0, leaveClassificationUnknown: false }
  return days.reduce((sum, day) => ({ ...sum, scheduledMinutes: sum.scheduledMinutes + day.scheduledMinutes, actualMinutes: sum.actualMinutes + day.actualMinutes, payableMinutes: sum.payableMinutes + day.payableMinutes, missingMinutes: sum.missingMinutes + day.missingMinutes, lateMinutes: sum.lateMinutes + day.lateMinutes, earlyDepartureMinutes: sum.earlyDepartureMinutes + day.earlyDepartureMinutes, extraMinutes: sum.extraMinutes + day.extraMinutes, restDayWorkMinutes: sum.restDayWorkMinutes + day.restDayWorkMinutes, holidayWorkMinutes: sum.holidayWorkMinutes + day.holidayWorkMinutes, approvedLeaveMinutes: sum.approvedLeaveMinutes + day.approvedLeaveMinutes, paidLeaveMinutes: sum.paidLeaveMinutes + day.paidLeaveMinutes, overnightWorkMinutes: sum.overnightWorkMinutes + day.overnightWorkMinutes, leaveClassificationUnknown: sum.leaveClassificationUnknown || day.leaveClassificationUnknown }), initial)
}

export function calculateHrTimeSummary(input: {
  startsOn: Date | string; endsOn: Date | string; timezone?: string; schedules: readonly HrScheduleRevision[]; shifts: readonly HrShiftInterval[]
  corrections?: readonly HrAttendanceCorrection[]; leaves?: readonly HrLeaveInterval[]; holidays?: readonly HrHolidayInterval[]
}): HrTimeSummary {
  const startsOn = dateKey(input.startsOn), endsOn = dateKey(input.endsOn); if (endsOn < startsOn) throw new Error('HR range ends before it starts')
  const timezone = input.timezone ?? 'Africa/Cairo'; const corrections = input.corrections ?? []; const leaves = input.leaves ?? []; const holidays = input.holidays ?? []
  const actual = new Map<string, number>(); const firstStart = new Map<string, number>(); const overnight = new Map<string, number>()
  for (const shift of input.shifts) {
    const correction = correctionForShift(shift, corrections); const openedAt = correction?.proposedOpenedAt ? asDate(correction.proposedOpenedAt) : asDate(shift.openedAt); const closedAt = correction?.proposedClosedAt ? asDate(correction.proposedClosedAt) : shift.closedAt ? asDate(shift.closedAt) : null
    if (!closedAt || closedAt <= openedAt) continue
    const byDate = intervalMinutesByDate(openedAt, closedAt, timezone, startsOn, endsOn)
    const startKey = localParts(openedAt, timezone).key
    for (const [key, minutes] of byDate) { actual.set(key, (actual.get(key) ?? 0) + minutes); if (key !== startKey) overnight.set(key, (overnight.get(key) ?? 0) + minutes) }
    const p = localParts(openedAt, timezone); if (p.key >= startsOn && p.key <= endsOn) firstStart.set(p.key, Math.min(firstStart.get(p.key) ?? p.minute, p.minute))
  }
  const days: HrDailyTimeSummary[] = []
  for (let key = startsOn; key <= endsOn; key = addDays(key, 1)) {
    const schedule = effectiveSchedule(input.schedules, key); const plan = schedule?.days.find((day) => day.weekday === weekday(key)); const scheduled = scheduledMinutes(plan); const actualMinutes = actual.get(key) ?? 0
    const holiday = holidays.some((item) => dateKey(item.startsOn) <= key && key <= dateKey(item.endsOn)); const approvedLeave = leaves.find((item) => item.status === 'approved' && dateKey(item.startsOn) <= key && key <= dateKey(item.endsOn))
    const leaveUnknown = Boolean(approvedLeave && approvedLeave.paid === undefined); const paidLeaveMinutes = approvedLeave?.paid === true ? Math.max(0, scheduled - actualMinutes) : 0
    const expectedStart = plan && !plan.restDay && plan.startsAt ? minuteOfDay(plan.startsAt) : null; const grace = schedule?.graceMinutes ?? 0; const lateMinutes = expectedStart == null || firstStart.get(key) == null ? 0 : Math.max(0, firstStart.get(key)! - expectedStart - grace)
    const payableMinutes = actualMinutes + paidLeaveMinutes; const missingMinutes = Math.max(0, scheduled - actualMinutes - paidLeaveMinutes)
    days.push({ date: key, scheduledMinutes: scheduled, actualMinutes, payableMinutes, missingMinutes, lateMinutes, earlyDepartureMinutes: missingMinutes, extraMinutes: Math.max(0, actualMinutes - scheduled), restDayWorkMinutes: scheduled === 0 ? actualMinutes : 0, holidayWorkMinutes: holiday ? actualMinutes : 0, approvedLeaveMinutes: approvedLeave ? Math.max(0, scheduled - actualMinutes) : 0, paidLeaveMinutes, leaveClassificationUnknown: leaveUnknown, holiday, overnightWorkMinutes: overnight.get(key) ?? 0 })
  }
  return { timezone, startsOn, endsOn, days, totals: totals(days) }
}
