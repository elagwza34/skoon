/**
 * Pure scheduling/attendance rules. Database services must supply the
 * effective schedule revision and existing Shift timestamps; this module never
 * creates a second clock-in/out record and never infers a clock-out.
 */
export type WeeklyScheduleDay = {
  weekday: number // 0=Sunday … 6=Saturday
  restDay: boolean
  startsAt?: string | null // HH:mm, branch-local time
  endsAt?: string | null
  intervals?: readonly { startsAt: string; endsAt: string; unpaidBreakMinutes?: number }[]
}

export type AttendanceEvaluation = {
  lateMinutes: number
  overtimeMinutes: number
  earlyDepartureMinutes: number
  overnight: boolean
}

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

/** Validates a revision without making an arbitrary staffing decision. */
export function validateWeeklySchedule(days: readonly WeeklyScheduleDay[]): string | null {
  const seen = new Set<number>()
  for (const day of days) {
    if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6 || seen.has(day.weekday)) return 'Each weekday must appear once at most'
    seen.add(day.weekday)
    const intervals = day.intervals?.length ? day.intervals : day.startsAt && day.endsAt ? [{ startsAt: day.startsAt, endsAt: day.endsAt }] : []
    if (day.restDay && (Boolean(day.startsAt) || Boolean(day.endsAt) || intervals.length)) return 'A rest day cannot have working hours'
    if (!day.restDay && !intervals.length) return 'A working day needs at least one interval'
    const expanded = intervals.map((interval) => { if (!TIME.test(interval.startsAt) || !TIME.test(interval.endsAt)) return null; const start = minutes(interval.startsAt); const rawEnd = minutes(interval.endsAt); const end = rawEnd <= start ? rawEnd + 1440 : rawEnd; const unpaid = interval.unpaidBreakMinutes ?? 0; return { start, end, unpaid } })
    if (expanded.some((interval) => !interval || !Number.isInteger(interval.unpaid) || interval.unpaid < 0 || interval.unpaid >= interval.end - interval.start)) return 'Working intervals and unpaid breaks are invalid'
    const ordered = expanded as Array<{ start: number; end: number; unpaid: number }>
    if (ordered.some((interval, index) => ordered.slice(0, index).some((prior) => interval.start < prior.end && prior.start < interval.end))) return 'Working intervals cannot overlap'
  }
  return null
}

/** Half-open effective ranges prevent two revisions governing the same date. */
export function effectivePeriodsOverlap(
  firstFrom: Date, firstUntil: Date | null, secondFrom: Date, secondUntil: Date | null,
): boolean {
  const firstEnd = firstUntil?.getTime() ?? Number.POSITIVE_INFINITY
  const secondEnd = secondUntil?.getTime() ?? Number.POSITIVE_INFINITY
  return firstFrom.getTime() < secondEnd && secondFrom.getTime() < firstEnd
}

/**
 * Uses an actual opened/closed Shift interval. A missing close timestamp means
 * no payable overtime/early-departure inference; callers can display review
 * required rather than fabricate time.
 */
export function evaluateAttendance(
  schedule: Pick<WeeklyScheduleDay, 'restDay' | 'startsAt' | 'endsAt'>,
  openedAt: Date,
  closedAt: Date | null,
  graceMinutes: number,
): AttendanceEvaluation | null {
  if (schedule.restDay || !schedule.startsAt || !schedule.endsAt || !TIME.test(schedule.startsAt) || !TIME.test(schedule.endsAt)) return null
  const start = minutes(schedule.startsAt)
  const endBase = minutes(schedule.endsAt)
  const overnight = endBase <= start
  const actualStart = openedAt.getHours() * 60 + openedAt.getMinutes()
  const lateMinutes = Math.max(0, actualStart - start - Math.max(0, graceMinutes))
  if (!closedAt) return { lateMinutes, overtimeMinutes: 0, earlyDepartureMinutes: 0, overnight }
  const scheduledEnd = endBase + (overnight ? 24 * 60 : 0)
  let actualEnd = closedAt.getHours() * 60 + closedAt.getMinutes()
  if (overnight && actualEnd < start) actualEnd += 24 * 60
  return {
    lateMinutes,
    overtimeMinutes: Math.max(0, actualEnd - scheduledEnd),
    earlyDepartureMinutes: Math.max(0, scheduledEnd - actualEnd),
    overnight,
  }
}
