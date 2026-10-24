import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, isOwner, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'

/**
 * Shifts write/read service — server-only. One OPEN shift per employee per branch.
 *
 * Reconciliation model:
 *   expected = opening + cash received − cash refunded  (payments linked to
 *   this shift; computed live for OPEN shifts, frozen at close)
 *   difference = counted (actual) − expected → positive = excess, negative
 *   = shortage.
 * POS order creation and payment finalization are REJECTED (409) while the
 * acting employee has no open shift, so money always lands in a till session.
 *
 * Concurrency: pg_advisory_xact_lock is keyed on (cashierId, branchId) so two
 * concurrent "open" posts for the same employee+branch cannot both pass.
 * Different employees in the same branch may have overlapping open shifts.
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

/** Roles whose shift involves cash handling (opening/closing cash balance). */
export const CASH_HANDLING_ROLES: readonly string[] = [ROLE.CASHIER, ROLE.MANAGER]

/** True when the role is expected to open/close a physical cash drawer. */
export function isCashHandlingRole(role: string): boolean {
  return CASH_HANDLING_ROLES.includes(role)
}

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
  cashierId: string
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
  handoverNotes: string | null
  handoverTo: string | null
  handoverCompletedAt: string | null
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
  userRole: string
  branches: { id: string; name: string }[]
  cashiers: { id: string; name: string }[]
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

/** Operational withdrawals reduce the physical till but are never sales. */
export function expectedCashAfterOperationalWithdrawals(expectedCash: number, withdrawals: number): number {
  return round2(round2(expectedCash) - round2(withdrawals))
}

/** difference = counted − expected (positive = excess, negative = shortage). */
export function cashDifferenceOf(closingCash: number, expectedCash: number): number {
  return round2(round2(closingCash) - round2(expectedCash))
}

export const openShiftSchema = z.object({
  // Opening cash is required for cash-handling roles, optional (default 0) otherwise.
  openingCash: z.coerce
    .number()
    .min(0, 'رصيد الافتتاح لا يمكن أن يكون سالبًا')
    .max(9_999_999, 'رصيد الافتتاح كبير جدًا')
    .optional()
    .default(0),
  // Owner (cross-branch) must name the branch; ignored for branch staff.
  branchId: z.coerce.number().int().positive().optional(),
})

export const closeShiftSchema = z.object({
  // Closing cash is required for cash-handling roles, optional (default 0) otherwise.
  closingCash: z.coerce
    .number()
    .min(0, 'الجرد لا يمكن أن يكون سالبًا')
    .max(9_999_999, 'الجرد كبير جدًا')
    .optional()
    .default(0),
  // Optional handover notes from the employee (e.g. handover remarks).
  handoverNotes: z.string().trim().max(1000).optional().nullable(),
  // Recipient identity, never a client-supplied role or display name.
  handoverRecipientId: z.string().uuid().optional().nullable(),
})

/** A close crossed midnight only when its branch-local calendar day changed. */
export function crossedLocalMidnight(openedAt: Date, closedAt: Date, timezone: string): boolean {
  const parts = (at: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at).filter((p) => p.type !== 'literal').map((p) => p.value).join('-')
  return parts(openedAt) !== parts(closedAt)
}

function money(n: number): string {
  return round2(n).toFixed(2)
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/** The employee's currently OPEN shift for a branch, or null. */
export async function getOpenShift(cashierId: string, branchId: bigint) {
  return prisma.shift.findFirst({
    where: { cashierId, branchId, status: 'open' },
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

function toShiftView(row: ShiftRow, payments: readonly CashPaymentRow[], ordersCount: number, operationalWithdrawals = 0): ShiftView {
  const { cashIn, cashOut } = computeShiftCashFlow(payments)
  // OPEN shifts show the LIVE expectation (payments keep landing); CLOSED
  // shifts show the value frozen at close time.
  const expected =
    row.status === 'open' ? expectedCashAfterOperationalWithdrawals(expectedCashFrom(Number(row.openingCash), payments), operationalWithdrawals) : Number(row.expectedCash)
  return {
    id: row.id.toString(),
    branchId: row.branchId.toString(),
    status: row.status === 'closed' ? 'closed' : 'open',
    openBy: row.openBy,
    cashierId: row.cashierId ?? '',
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
    handoverNotes: row.handoverNotes ?? null,
    handoverTo: row.handoverTo ?? null,
    handoverCompletedAt: row.handoverCompletedAt ? row.handoverCompletedAt.toISOString() : null,
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

/** Open a shift — any non-owner employee. 409 if the employee already has an
 *  open shift for the same branch. */
export async function openShift(session: StaffSession, input: unknown): Promise<ShiftView> {
  if (isOwner(session.role)) throw new ShiftError('المالك غير مطالب بفتح وردية تشغيلية', 403)

  const parsed = openShiftSchema.safeParse(input)
  if (!parsed.success) {
    throw new ShiftError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  }

  const branchId = resolveBranchId(session, parsed.data.branchId)

  // Cash-handling roles must declare an opening float; others default to 0.
  const requestedOpening = isCashHandlingRole(session.role) ? parsed.data.openingCash : 0

  // Serialize opens per employee+branch: the advisory lock is held to COMMIT,
  // so two concurrent "open" transactions for the same employee+branch cannot
  // both pass the check below. Different employees in the same branch may
  // overlap.
  const shift = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shift-open:' || ${session.id} || ':' || ${branchId.toString()}))`
    const existing = await tx.shift.findFirst({
      where: { cashierId: session.id, branchId, status: 'open' },
      orderBy: { openedAt: 'desc' },
    })
    if (existing) throw new ShiftError('لديك بالفعل وردية مفتوحة لهذا الفرع', 409)

    // An approved cashier handover is the next opening float. It can only be
    // consumed once; a manual value is allowed only when there is no handover.
    const incoming = await tx.financialMovement.findFirst({
      where: { branchId, type: 'cashier_handover', destinationUserId: session.id, consumedAt: null, status: 'posted' },
      orderBy: { occurredAt: 'asc' },
    })
    const opening = incoming ? Number(incoming.amount) : requestedOpening
    // Shift.openedAt is the HR clock-in source of truth. It is created in this
    // same transaction as the operational shift, making retries/concurrent
    // opens unable to create a second attendance interval.
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
    if (incoming) {
      await tx.financialMovement.update({ where: { id: incoming.id }, data: { consumedAt: new Date() } })
    }
    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId,
        action: 'shift.open',
        entityType: 'shift',
        entityId: created.id,
        newValues: { openingCash: opening.toFixed(2), openBy: session.name, role: session.role, handoverMovementId: incoming?.id.toString() ?? null },
      },
    })
    return created
  })

  return toShiftView(shift, [], 0)
}

/**
 * Close a shift — any non-owner employee who owns the shift. Recomputes
 * expected cash from the shift's linked payments, stores counted cash and the
 * variance. Cash-handling roles must provide a physical count.
 */
export async function closeShift(
  session: StaffSession,
  shiftIdRaw: string,
  input: unknown,
): Promise<ShiftView> {
  if (isOwner(session.role)) throw new ShiftError('غير مصرح', 403)
  if (!/^\d+$/.test(shiftIdRaw)) throw new ShiftError('الوردية غير موجودة', 404)

  const parsed = closeShiftSchema.safeParse(input)
  if (!parsed.success) {
    throw new ShiftError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  }

  const shiftId = BigInt(shiftIdRaw)
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
  if (!shift) throw new ShiftError('الوردية غير موجودة', 404)
  if (shift.cashierId !== session.id) throw new ShiftError('لا يمكنك إغلاق وردية ليست ورديتك', 403)
  if (!staffCanAccessBranch(session, shift.branchId)) throw new ShiftError('غير مصرح', 403)
  if (shift.status === 'closed') throw new ShiftError('الوردية مغلقة بالفعل', 409)

  const branch = await prisma.cafeBranch.findUnique({ where: { id: shift.branchId }, select: { timezone: true } })
  if (!branch) throw new ShiftError('الفرع غير موجود', 404)
  let recipient: { id: string; name: string } | null = null
  if (parsed.data.handoverRecipientId) {
    recipient = await prisma.user.findFirst({
      where: { id: parsed.data.handoverRecipientId, branchId: shift.branchId, isActive: true, deletedAt: null, role: { is: { slug: ROLE.CASHIER } } },
      select: { id: true, name: true },
    })
    if (!recipient) throw new ShiftError('المستلم يجب أن يكون كاشيراً نشطاً في نفس الفرع', 422)
  }

  const payments = await fetchShiftPayments(shiftId)
  const withdrawals = await prisma.financialMovement.aggregate({
    where: { sourceShiftId: shiftId, type: 'operational_withdrawal', status: 'posted' }, _sum: { amount: true },
  })
  const expected = expectedCashAfterOperationalWithdrawals(
    expectedCashFrom(Number(shift.openingCash), payments), Number(withdrawals._sum.amount ?? 0),
  )
  // Non-cash-handling roles (waiter, kitchen) close operationally — no
  // physical cash count, no cash reconciliation. Only cash-handling roles
  // (cashier, manager) enter an actual counted amount and produce a variance.
  const cashHandling = isCashHandlingRole(session.role)
  const closing = cashHandling ? parsed.data.closingCash : 0
  const difference = cashHandling ? cashDifferenceOf(closing, expected) : 0

  // Outstanding work on this shift (non-terminal orders) — recorded in the
  // handover so the receiving employee knows what remains unresolved.
  const outstandingOrders = await prisma.order.findMany({
    where: { shiftId, status: { in: ['new', 'preparing', 'ready'] } },
    select: { orderNumber: true, status: true, total: true },
    orderBy: { createdAt: 'asc' },
  })

  const closed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shift-close:' || ${shiftId.toString()}))`
    // Lock the shift row before checking waiter ownership so an accepted
    // responsibility handover and a close cannot race past each other.
    await tx.$queryRaw`SELECT id FROM shifts WHERE id = ${shiftId} FOR UPDATE`
    if (session.role === ROLE.WAITER) {
      const outstandingResponsibilities = await tx.order.count({
        where: { branchId: shift.branchId, responsibleWaiterId: session.id, status: { in: ['new', 'preparing', 'ready'] } },
      })
      if (outstandingResponsibilities > 0) {
        throw new ShiftError('Transfer or resolve outstanding waiter responsibilities before closing the shift', 409)
      }
    }
    const closedAt = new Date()
    const routeToSafe = crossedLocalMidnight(shift.openedAt, closedAt, branch.timezone)
    if (!routeToSafe && !recipient && cashHandling) throw new ShiftError('اختر كاشيراً مستلماً قبل منتصف الليل', 422)
    // Guard inside the transaction: a concurrent close loses the race cleanly.
    // Shift.closedAt is the paired HR clock-out. It is written atomically with
    // reconciliation, never by login/logout/session expiry.
    const updated = await tx.shift.updateMany({
      where: { id: shiftId, status: 'open', cashierId: session.id },
      data: {
        expectedCash: expected.toFixed(2),
        closingCash: closing.toFixed(2),
        cashDifference: difference.toFixed(2),
        status: 'closed',
        closedAt,
        // Handover / reconciliation record — written at close time so the
        // closing figures are immutable after this point.
        handoverNotes: parsed.data.handoverNotes ?? null,
        handoverTo: routeToSafe ? 'MAIN_SAFE' : recipient?.name ?? null,
        handoverCompletedAt: closedAt,
      },
    })
    if (updated.count === 0) throw new ShiftError('الوردية مغلقة بالفعل', 409)

    if (cashHandling) {
      await tx.financialMovement.create({
        data: {
          branchId: shift.branchId, type: routeToSafe ? 'main_safe_deposit' : 'cashier_handover', status: 'posted',
          amount: closing.toFixed(2), sourceAccount: 'CASHIER_TILL', destinationAccount: routeToSafe ? 'MAIN_SAFE' : 'CASHIER_TILL',
          sourceShiftId: shiftId, destinationUserId: routeToSafe ? null : recipient!.id, actorId: session.id,
          reason: parsed.data.handoverNotes || 'Shift close handover', occurredAt: closedAt,
          metadata: { route: routeToSafe ? 'main_safe_after_local_midnight' : 'cashier_before_local_midnight', timezone: branch.timezone },
        },
      })
    }

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
          operationalWithdrawals: Number(withdrawals._sum.amount ?? 0).toFixed(2),
          cashHandling,
          handoverNotes: parsed.data.handoverNotes ?? null,
          handoverTo: routeToSafe ? 'MAIN_SAFE' : recipient?.name ?? null,
          handoverCompletedAt: closedAt.toISOString(),
          handoverRecipientId: routeToSafe ? null : recipient?.id ?? null,
          route: routeToSafe ? 'main_safe_after_local_midnight' : 'cashier_before_local_midnight',
          outstandingOrders: outstandingOrders.map((o) => ({
            orderNumber: o.orderNumber,
            status: o.status,
            total: Number(o.total).toFixed(2),
          })),
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
 * Require an open shift for the acting employee on their branch. Returns the
 * shift or throws a 409 ShiftError. Owner and Manager are exempt (return null).
 */
export async function requireOpenShift(session: StaffSession): Promise<ShiftRow | null> {
  if (!requiresOperationalShift(session.role)) return null
  if (session.branchId === null) throw new ShiftError('غير مصرح — لا فرع مرتبط بالمستخدم', 403)
  const shift = await getOpenShift(session.id, BigInt(session.branchId))
  if (!shift) throw new ShiftError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)
  return shift
}

/**
 * Board snapshot: the employee's current open shift (with live numbers +
 * its recent orders) and the employee's last shifts. Owners may pass
 * ?branchId= and ?cashierId= to view another employee's branch.
 */
export async function getShiftsBoard(
  session: StaffSession,
  branchIdRaw?: string,
  cashierIdRaw?: string,
): Promise<ShiftBoardData> {
  let branchId: bigint
  let viewerCashierId: string

  if (isOwner(session.role)) {
    // Owner may explicitly choose a branch and (optionally) an employee.
    if (branchIdRaw && /^\d+$/.test(branchIdRaw)) {
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
    viewerCashierId = cashierIdRaw ?? session.id
  } else {
    if (session.branchId === null) throw new ShiftError('غير مصرح — لا فرع مرتبط بالمستخدم', 403)
    branchId = BigInt(session.branchId)
    viewerCashierId = session.id
  }

  if (!staffCanAccessBranch(session, branchId)) throw new ShiftError('غير مصرح', 403)

  const [current, recent, branches, cashiers] = await Promise.all([
    prisma.shift.findFirst({
      where: { cashierId: viewerCashierId, branchId, status: 'open' },
      orderBy: { openedAt: 'desc' },
    }),
    prisma.shift.findMany({
      where: { cashierId: viewerCashierId, branchId },
      orderBy: { openedAt: 'desc' },
      take: 10,
    }),
    isOwner(session.role)
      ? prisma.cafeBranch.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: { branchId, isActive: true, deletedAt: null, role: { is: { slug: ROLE.CASHIER } } },
      orderBy: { name: 'asc' }, select: { id: true, name: true },
    }),
  ])

  const shiftIds = recent.map((s) => s.id)
  const [payments, orderCounts, withdrawalRows] = await Promise.all([
    shiftIds.length
      ? prisma.payment.findMany({
          where: { shiftId: { in: shiftIds } },
          select: { shiftId: true, method: true, status: true, amount: true },
        })
      : Promise.resolve([]),
    shiftIds.length
      ? prisma.order.groupBy({ by: ['shiftId'], where: { shiftId: { in: shiftIds } }, _count: true })
      : Promise.resolve([]),
    shiftIds.length
      ? prisma.financialMovement.groupBy({ by: ['sourceShiftId'], where: { sourceShiftId: { in: shiftIds }, type: 'operational_withdrawal', status: 'posted' }, _sum: { amount: true } })
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
  const withdrawalsByShift = new Map<string, number>()
  for (const row of withdrawalRows) if (row.sourceShiftId !== null) withdrawalsByShift.set(row.sourceShiftId.toString(), Number(row._sum.amount ?? 0))

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
      withdrawalsByShift.get(row.id.toString()) ?? 0,
    )

  return {
    branchId: branchId.toString(),
    userRole: session.role,
    branches: branches.map((b) => ({ id: b.id.toString(), name: b.name })),
    cashiers: cashiers.map((user) => ({ id: user.id, name: user.name })),
    current: current ? viewOf(current) : null,
    currentOrders,
    recent: recent.map(viewOf),
  }
}
