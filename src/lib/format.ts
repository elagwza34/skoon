/**
 * Arabic-first formatting helpers.
 *
 * All outputs use Latin (ASCII) digits (`nu-latn`) for unambiguous reading in a
 * business/ops context, with Arabic labels and locale month names. Currency is
 * EGP (Egyptian Pound) — the project default. No external date/number library
 * is used; Intl is sufficient and dependency-free.
 */

const AR_EG = 'ar-EG-u-nu-latn'

/** Money: `1,234.50 ج.م` (EGP). Use for all prices, totals and payments. */
export function formatCurrency(value: number): string {
  const n = Number.isFinite(value) ? value : 0
  return `${new Intl.NumberFormat(AR_EG, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)} ج.م`
}

/** Compact money for chart axes/tooltips: `12.5 ألف ج.م`, `1.2 مليون ج.م`. */
export function formatCurrencyCompact(value: number): string {
  const n = Number.isFinite(value) ? value : 0
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} مليون ج.م`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} ألف ج.م`
  return `${n.toFixed(0)} ج.م`
}

/** Plain grouped integer/number: `1,234`. */
export function formatNumber(value: number, fractionDigits = 0): string {
  const n = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat(AR_EG, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)
}

/** Percentage with one decimal: `18.5%`. */
export function formatPercent(value: number, fractionDigits = 1): string {
  const n = Number.isFinite(value) ? value : 0
  return `${new Intl.NumberFormat(AR_EG, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)}%`
}

/** Full date with Arabic weekday + month: `الخميس، 9 أكتوبر 2026`. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(AR_EG, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** Short date: `9 أكتوبر 2026`. */
export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat(AR_EG, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** 24h time: `14:05`. */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(AR_EG, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/** Relative time in Arabic, e.g. `قبل 5 دقائق`. Falls back to time. */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `قبل ${mins} دقيقة`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `قبل ${hours} ساعة`
  const days = Math.round(hours / 24)
  return `قبل ${days} يوم`
}

/** Single-letter-ish hour label for chart axis, e.g. `14:00`. */
export function formatHourLabel(date: Date): string {
  return new Intl.DateTimeFormat(AR_EG, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
