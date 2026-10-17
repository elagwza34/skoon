import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'

/**
 * Shifts write/read service — server-only. One OPEN till session per branch.
 *
 * Reconciliation model (MVP P0):
 *   expected = opening + cash received − cash refunded  (payments linked to
 *   this shift; computed live for OPEN shifts, frozen at close)
 *   difference = counted (actual) − expected → positive = excess, negative
 *   = shortage.
 * POS order creation and payment finalization are REJECTED (409) while the
 * branch has no open shift, so money always lands in a till session.
 *
 * Known MVP limits (documented, not blocking):
 *   - One-open-shift-per-branch is checked in app code (no partial unique
 *     index), so two simultaneous "open" posts could race.
 *   - A refund issued AFTER its shift closed changes the cash story of a
 *     shift that is already settled; the audit row keeps the trail honest.
 */

export class ShiftError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ShiftError'
    this.status = status
  }
}

export type ShiftStatus = 'open' | 'closed'

/** Payment row slice needed for cash math (amounts pre-converted to number). */
export interface CashPaymentRow {
  method: string
  status: string
  amount: number
}

export interface ShiftView {
  id: string
  branchId: string
  status: ShiftStatus
  openBy: string
  openingCash: string
  expectedCash: string
  closingCash: string
  cashDifference: string
  cashIn: string
  cashOut: string
  paymentsCount: number
  ordersCount: number
  openedAt: string
  closedAt: string | null
}

export interface ShiftOrderRow {
  orderNumber: string
  total: string
  status: string
  paymentStatus: string
  createdAt: string
}

export interface ShiftBoardData {
  branchId: string
  branches: { id: string; name: string }[]
  current: ShiftView | null
  currentOrders: ShiftOrderRow[]
  recent: ShiftView[]
}

// ---------------------------------------------------------------------------
// Pure helpers (offline unit-testable — no prisma, no session).
// ---------------------------------------------------------------------------

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Cash flow of a shift: completed cash payments in, refunded cash payments out. */
export function computeShiftCashFlow(payments: readonly CashPaymentRow[]): {
  cashIn: number
  cashOut: number
  netCash: number
} {
  let cashIn = 0
  let cashOut = 0
  for (const p of payments) {
    if (p.method !== 'cash') continue
    if (p.status === 'completed') cashIn += p.amount
    else if (p.status === 'refunded') cashOut += p.amount
  }
  cashIn = round2(cashIn)
  cashOut = round2(cashOut)
  return { cashIn, cashOut, netCash: round2(cashIn - cashOut) }
}

/** expected = opening + net cash movement of the shift's linked payments. */
export function expectedCashFrom(openingCash: number, payments: readonly CashPaymentRow[]): number {
  return round2(round2(openingCash) + computeShiftCashFlow(payments).netCash)
}

/** difference = counted − expected (positive = excess, negative = shortage). */
export function cashDifferenceOf(closingCash: number, expectedCash: number): number {
  return round2(round2(closingCash) - round2(expectedCash))
}

export const openShiftSchema = z.object({
  openingCash: z.coerce
    .number()
    .min(0, 'رصيد الافتتاح لا يمكن أن يكون سالبًا')
    .max(9_999_999, 'رصيد الافتتاح كبير جدًا'),
  // Owner (cross-branch) must name the branch; ignored for branch staff.
  branchId: z.coerce.number().int().positive().optional(),
})

export const closeShiftSchema = z.object({
  closingCash: z.coerce
    .number()
    .min(0, 'الجرد لا يمكن أن يكون سالبًا')
    .max(9_999_999, 'الجرد كبير جدًا'),
})

function money(n: number): string {
  return round2(n).toFixed(2)
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/** The branch's currently OPEN shift, or null. */
export async function getOpenShift(branchId: bigint) {
  return prisma.shift.findFirst({
    where: { branchId, status: 'open' },
    orderBy: { openedAt: 'desc' },
  })
}

type ShiftRow = NonNullable<Awaited<ReturnType<typeof getOpenShift>>>

async function fetchShiftPayments(shiftId: bigint): Promise<CashPaymentRow[]> {
  const rows = await prisma.payment.findMany({
    where: { shiftId },
    select: { method: true, status: true, amount: true },
  })
  return rows.map((r) => ({ method: r.method, status: r.status, amount: Number(r.amount) }))
}

function toShiftView(row: ShiftRow, payments: readonly CashPaymentRow[], ordersCount: number): ShiftView {
  const { cashIn, cashOut } = computeShiftCashFlow(payments)
  // OPEN shifts show the LIVE expectation (payments keep landing); CLOSED
  // shifts show the value frozen at close time.
  const expected =
    row.status === 'open' ? expectedCashFrom(Number(row.openingCash), payments) : Number(row.expectedCash)
  return {
    id: row.id.toString(),
    branchId: row.branchId.toString(),
    status: row.status === 'closed' ? 'closed' : 'open',
    openBy: row.openBy,
    openingCash: money(Number(row.openingCash)),
    expectedCash: money(expected),
    closingCash: money(Number(row.closingCash)),
    cashDifference: money(Number(row.cashDifference)),
    cashIn: money(cashIn),
    cashOut: money(cashOut),
    paymentsCount: payments.length,
    ordersCount,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  }
}

/** Branch for this action: staff → own branch; owner → explicit choice. */
function resolveBranchId(session: StaffSession, requested?: number): bigint {
  if (session.branchId !== null) return BigInt(session.branchId)
  if (requested === undefined) throw new ShiftError('اختر الفرع', 400)
  const branchId = BigInt(requested)
  if (!staffCanAccessBranch(session, branchId)) throw new ShiftError('غير مصرح', 403)
  return branchId
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Open a till session — cashier+. 409 if the branch already has an open shift. */
export async function openShift(session: StaffSession, input: unknown): Promise<ShiftView> {
  if (!hasAtLeast(session.role, ROLE.CASHIER)) throw new ShiftError('غير مصرح', 403)

  const parsed = openShiftSchema.safeParse(input)
  if (!parsed.success) {
    throw new ShiftError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  }

  const branchId = resolveBranchId(session, parsed.data.branchId)

  // Serialize opens per branch: pg_advisory_xact_lock is held to COMMIT, so
  // two concurrent "open" transactions cannot both pass the check below.
  const shift = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shift-open:' || ${branchId.toString()}))`
    const existing = await tx.shift.findFirst({
      where: { branchId, status: 'open' },
      orderBy: { openedAt: 'desc' },
    })
    if (existing) throw new ShiftError('يوجد وردية مفتوحة بالفعل لهذا الفرع', 409)

    const opening = parsed.data.openingCash
    const created = await tx.shift.create({
      data: {
        branchId,
        openBy: session.name,
        cashierId: session.id,
        openingCash: opening.toFixed(2),
        expectedCash: opening.toFixed(2),
        status: 'open',
      },
    })
    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId,
        action: 'shift.open',
        entityType: 'shift',
        entityId: created.id,
        newValues: { openingCash: opening.toFixed(2), openBy: session.name },
      },
    })
    return created
  })

  return toShiftView(shift, [], 0)
}

/**
 * Close a till session — cashier+, branch-scoped. Recomputes expected cash
 * from the shift's linked payments, stores counted cash and the variance.
 */
export async function closeShift(
  session: StaffSession,
  shiftIdRaw: string,
  input: unknown,
): Promise<ShiftView> {
  if (!hasAtLeast(session.role, ROLE.CASHIER)) throw new ShiftError('غير مصرح', 403)
  if (!/^\d+$/.test(shiftIdRaw)) throw new ShiftError('الوردية غير موجودة', 404)

  const parsed = closeShiftSchema.safeParse(input)
  if (!parsed.success) {
    throw new ShiftError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  }

  const shiftId = BigInt(shiftIdRaw)
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
  if (!shift) throw new ShiftError('الوردية غير موجودة', 404)
  if (!staffCanAccessBranch(session, shift.branchId)) throw new ShiftError('غير مصرح', 403)
  if (shift.status === 'closed') throw new ShiftError('الوردية مغلقة بالفعل', 409)

  const payments = await fetchShiftPayments(shiftId)
  const expected = expectedCashFrom(Number(shift.openingCash), payments)
  const closing = parsed.data.closingCash
  const difference = cashDifferenceOf(closing, expected)

  const closed = await prisma.$transaction(async (tx) => {
    // Guard inside the transaction: a concurrent close loses the race cleanly.
    const updated = await tx.shift.updateMany({
      where: { id: shiftId, status: 'open' },
      data: {
        expectedCash: expected.toFixed(2),
        closingCash: closing.toFixed(2),
        cashDifference: difference.toFixed(2),
        status: 'closed',
        closedAt: new Date(),
      },
    })
    if (updated.count === 0) throw new ShiftError('الوردية مغلقة بالفعل', 409)

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: shift.branchId,
        action: 'shift.close',
        entityType: 'shift',
        entityId: shiftId,
        newValues: {
          expectedCash: expected.toFixed(2),
          closingCash: closing.toFixed(2),
          cashDifference: difference.toFixed(2),
        },
      },
    })

    const row = await tx.shift.findUnique({ where: { id: shiftId } })
    if (!row) throw new ShiftError('الوردية غير موجودة', 404)
    return row
  })

  return toShiftView(closed, payments, 0)
}

/**
 * Board snapshot: current open shift (with live numbers + its recent orders)
 * and the last shifts of the branch. Owners may pass ?branchId=.
 */
export async function getShiftsBoard(
  session: StaffSession,
  branchIdRaw?: string,
): Promise<ShiftBoardData> {
  let branchId: bigint
  if (session.branchId !== null) {
    branchId = BigInt(session.branchId)
  } else if (branchIdRaw && /^\d+$/.test(branchIdRaw)) {
    branchId = BigInt(branchIdRaw)
  } else {
    const first = await prisma.cafeBranch.findFirst({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    if (!first) throw new ShiftError('لا يوجد فرع نشط', 404)
    branchId = first.id
  }

  const [current, recent, branches] = await Promise.all([
    prisma.shift.findFirst({
      where: { branchId, status: 'open' },
      orderBy: { openedAt: 'desc' },
    }),
    prisma.shift.findMany({ where: { branchId }, orderBy: { openedAt: 'desc' }, take: 10 }),
    session.role === ROLE.OWNER
      ? prisma.cafeBranch.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  const shiftIds = recent.map((s) => s.id)
  const [payments, orderCounts] = await Promise.all([
    shiftIds.length
      ? prisma.payment.findMany({
          where: { shiftId: { in: shiftIds } },
          select: { shiftId: true, method: true, status: true, amount: true },
        })
      : Promise.resolve([]),
    shiftIds.length
      ? prisma.order.groupBy({ by: ['shiftId'], where: { shiftId: { in: shiftIds } }, _count: true })
      : Promise.resolve([]),
  ])

  const paymentsByShift = new Map<string, CashPaymentRow[]>()
  for (const p of payments) {
    if (p.shiftId === null) continue
    const key = p.shiftId.toString()
    const list = paymentsByShift.get(key) ?? []
    list.push({ method: p.method, status: p.status, amount: Number(p.amount) })
    paymentsByShift.set(key, list)
  }
  const ordersByShift = new Map<string, number>()
  for (const g of orderCounts) {
    if (g.shiftId === null) continue
    ordersByShift.set(g.shiftId.toString(), g._count)
  }

  let currentOrders: ShiftOrderRow[] = []
  if (current) {
    const rows = await prisma.order.findMany({
      where: { shiftId: current.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        orderNumber: true,
        total: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
      },
    })
    currentOrders = rows.map((r) => ({
      orderNumber: r.orderNumber,
      total: Number(r.total).toFixed(2),
      status: r.status,
      paymentStatus: r.paymentStatus,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  const viewOf = (row: ShiftRow): ShiftView =>
    toShiftView(
      row,
      paymentsByShift.get(row.id.toString()) ?? [],
      ordersByShift.get(row.id.toString()) ?? 0,
    )

  return {
    branchId: branchId.toString(),
    branches: branches.map((b) => ({ id: b.id.toString(), name: b.name })),
    current: current ? viewOf(current) : null,
    currentOrders,
    recent: recent.map(viewOf),
  }
}
