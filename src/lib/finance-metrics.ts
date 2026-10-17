import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'

/**
 * Finance metrics — payment-truth aggregation helpers (server-side).
 *
 * FINANCIAL DEFINITIONS (order value vs cash collected — kept distinct on purpose):
 * - Order value  = sum of Order.total for non-cancelled orders in range (intent).
 * - Collected    = sum of Payment.amount WHERE status = 'completed' (cash truth).
 *                  Refunded payments (completed -> refunded flip) are excluded by
 *                  the status filter; pending/failed payments never count.
 * - Refunded     = sum of Payment.amount WHERE status = 'refunded', reported
 *                  SEPARATELY and never subtracted again (no double-subtract).
 * - V1 limits (see staff-payments-write): full-order refunds only. Partial
 *   refunds, split tender, discounts/tax are NOT representable and NOT claimed.
 * - Collected revenue is attributed to the PAYMENT date (Payment.createdAt),
 *   not the order date — pay-later orders count when the cash lands.
 *
 * PRECISION: money is aggregated in integer minor units (piasters) via exact
 * decimal-string parsing — never via float addition. See `toCents`.
 */

/** Fallback reporting timezone (Cairo). Branch rows may override. */
export const DEFAULT_TZ = 'Africa/Cairo'

/** A payment row counts as retained cash only while its status is 'completed'. */
export function isCollectedStatus(status: string): boolean {
  return status === 'completed'
}

/** A payment row counts as refunded only after the refund flip. */
export function isRefundedStatus(status: string): boolean {
  return status === 'refunded'
}

/**
 * Exact decimal-money -> integer minor units (EGP -> piasters).
 * Accepts Prisma Decimal (via String()), number, or numeric string.
 * Throws on anything that is not a plain 2dp decimal — garbage must fail
 * loudly rather than silently become 0.
 */
export function toCents(amount: unknown): number {
  const raw = typeof amount === 'number' || typeof amount === 'string' ? String(amount) : String(amount ?? '0')
  const s = raw.trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid money value: ${raw}`)
  const neg = s.startsWith('-')
  const digits = neg ? s.slice(1) : s
  const [intPart, fracPart = ''] = digits.split('.')
  const cents = Number(intPart) * 100 + Number((fracPart + '00').slice(0, 2))
  return neg ? -cents : cents
}

/** Integer minor units -> major units for display/DTOs. */
export function centsToAmount(cents: number): number {
  return cents / 100
}

export interface PaymentLike {
  status: string
  method: string
  amount: unknown
}

export interface PaymentSummary {
  collectedCents: number
  refundedCents: number
  completedCount: number
  refundedCount: number
  /** pending / failed / unknown statuses — never revenue, tracked for visibility. */
  ignoredCount: number
  byMethodCents: Record<string, number>
}

/**
 * Pure aggregation of payment rows into collected / refunded / by-method.
 * Cancelled or unpaid orders contribute NOTHING by construction: they have
 * no completed payment row, so they never enter this function.
 */
export function summarizePayments(rows: PaymentLike[]): PaymentSummary {
  const out: PaymentSummary = {
    collectedCents: 0,
    refundedCents: 0,
    completedCount: 0,
    refundedCount: 0,
    ignoredCount: 0,
    byMethodCents: {},
  }
  for (const r of rows) {
    const cents = toCents(r.amount)
    if (isCollectedStatus(r.status)) {
      out.collectedCents += cents
      out.completedCount += 1
      out.byMethodCents[r.method] = (out.byMethodCents[r.method] ?? 0) + cents
    } else if (isRefundedStatus(r.status)) {
      out.refundedCents += cents
      out.refundedCount += 1
    } else {
      out.ignoredCount += 1
    }
  }
  return out
}

/** Invariant: method subtotals must sum exactly to collected (same rows, same math). */
export function methodTotalsReconcile(s: PaymentSummary): boolean {
  return Object.values(s.byMethodCents).reduce((a, b) => a + b, 0) === s.collectedCents
}

/** Average collected cash per paid order (0 when no paid orders — never NaN). */
export function avgPerPaidOrder(collectedCents: number, paidOrders: number): number {
  if (!paidOrders) return 0
  return Math.round(collectedCents / paidOrders) / 100
}

/** Branch scope shared by finance queries (owner = all branches, else own). */
export function financeBranchScope(session: StaffSession): Record<string, never> | { branchId: bigint } {
  return session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }
}

/**
 * Reporting timezone: the caller's own branch timezone; Cairo default for the
 * owner (cross-branch — one boundary cannot fit mixed-TZ branches; all current
 * branches are Cairo, so this is a documented no-op today). Never throws.
 */
export async function resolveSessionTimezone(session: StaffSession): Promise<string> {
  if (session.role === ROLE.OWNER || !session.branchId) return DEFAULT_TZ
  try {
    const branch = await prisma.cafeBranch.findUnique({
      where: { id: BigInt(session.branchId) },
      select: { timezone: true },
    })
    return branch?.timezone?.trim() || DEFAULT_TZ
  } catch {
    return DEFAULT_TZ
  }
}

export interface CollectedStats {
  collectedCents: number
  refundedCents: number
  /** Distinct orders with at least one completed payment in the window. */
  paidOrders: number
  byMethodCents: Record<string, number>
}

/**
 * Database-side payment-truth aggregation for a payment-date window
 * [start, end). Branch-scoped. Two bounded groupBy queries — no table fetch.
 */
export async function getCollectedStats(
  session: StaffSession,
  start: Date,
  end?: Date,
): Promise<CollectedStats> {
  const branchScope = financeBranchScope(session)
  const createdAt = end ? { gte: start, lt: end } : { gte: start }
  const [groups, paid] = await Promise.all([
    prisma.payment.groupBy({
      by: ['status', 'method'],
      where: { ...branchScope, createdAt },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['orderId'],
      where: { ...branchScope, createdAt, status: 'completed' },
    }),
  ])
  let collectedCents = 0
  let refundedCents = 0
  const byMethodCents: Record<string, number> = {}
  for (const g of groups) {
    const cents = toCents(g._sum.amount?.toString() ?? '0')
    if (g.status === 'completed') {
      collectedCents += cents
      byMethodCents[g.method] = (byMethodCents[g.method] ?? 0) + cents
    } else if (g.status === 'refunded') {
      refundedCents += cents
    }
    // pending / failed / unknown: ignored — never revenue.
  }
  return { collectedCents, refundedCents, paidOrders: paid.length, byMethodCents }
}

