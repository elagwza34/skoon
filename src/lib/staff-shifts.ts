import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, isOwner, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { lockAndReadShift } from '@/lib/financial-shift-lock'

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

/** Map the durable partial-index race outcome to the public shift contract. */
export function isOpenShiftUniquenessConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error as { code?: unknown }).code === 'P2002'
}

export type ShiftStatus = 'open' | 'closed'

/** Roles whose shift involves mandatory cash handling (opening/closing cash balance).
 *
 * Manager is intentionally EXCLUDED: a Manager may open/close an operational
 * shift without mandatory cash custody. Cash drawer custody for a Manager is
 * an explicit, out-of-band assignment (not inferred from the role). Until such
 * an assignment exists and is approved, a Manager's shift is non-cash.
 */
export const CASH_HANDLING_ROLES: readonly string[] = [ROLE.CASHIER]

/** True when the role is expected to open/close a physical cash drawer. */
export function isCashHandlingRole(role: string): boolean {
  return CASH_HANDLING_ROLES.includes(role)
}

/** Physical counts must be explicit, finite, and representable in whole cents. */
export const handoverCountSchema = z.number().finite().min(0).max(9_999_999)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'أدخل مبلغًا بدقة منزلتين عشريتين')

export const cashHandoverActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept'), handoverId: z.string().regex(/^\d+$/), countedAmount: handoverCountSchema, confirmed: z.literal(true), branchId: z.string().regex(/^\d+$/).optional() }).strict(),
  z.object({ action: z.enum(['dispute', 'reject']), handoverId: z.string().regex(/^\d+$/), countedAmount: handoverCountSchema, confirmed: z.literal(true), disputeReason: z.string().trim().min(3).max(1000), branchId: z.string().regex(/^\d+$/).optional() }).strict(),
  z.object({ action: z.literal('resolve'), handoverId: z.string().regex(/^\d+$/), resolvedAmount: handoverCountSchema, confirmed: z.literal(true), resolutionNote: z.string().trim().min(3).max(500), branchId: z.string().regex(/^\d+$/).optional() }).strict(),
])

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
  waiterOpenTables?: { tableId: string; tableNumber: string; ordersCount: number }[]
  handoffRecipients?: { id: string; name: string; role: string }[]
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
  /** When waiter closes with open tables/orders, transfer them to this eligible branch waiter. */
  tableHandoffRecipientId: z.string().uuid().optional().nullable(),
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

async function fetchShiftPayments(client: Pick<typeof prisma, 'payment'>, shiftId: bigint, branchId?: bigint): Promise<CashPaymentRow[]> {
  const rows = await client.payment.findMany({
    where: { shiftId, ...(branchId === undefined ? {} : { branchId }) },
    select: { method: true, status: true, amount: true },
  })
  return rows.map((r) => ({ method: r.method, status: r.status, amount: Number(r.amount) }))
}

/** One live till equation for refund funding checks, open views and close.
 * Only committed cash-refund ledger events belong to the executing shift. */
export async function readShiftCashState(client: Pick<typeof prisma, 'payment' | 'financialMovement'>, shift: { id: bigint; branchId: bigint; openingCash: unknown }) {
  const [payments, withdrawals, refunds] = await Promise.all([
    fetchShiftPayments(client, shift.id, shift.branchId),
    client.financialMovement.aggregate({ where: { branchId: shift.branchId, sourceShiftId: shift.id, type: 'operational_withdrawal', status: 'posted' }, _sum: { amount: true } }),
    client.financialMovement.aggregate({ where: { branchId: shift.branchId, sourceShiftId: shift.id, type: 'cash_refund', status: 'posted', sourceAccount: 'CASHIER_TILL', destinationAccount: 'CUSTOMER' }, _sum: { amount: true } }),
  ])
  const operationalWithdrawals = Number(withdrawals._sum.amount ?? 0)
  const cashRefunds = Number(refunds._sum.amount ?? 0)
  return { payments, operationalWithdrawals, cashRefunds, expectedCash: expectedCashAfterRefunds(Number(shift.openingCash), payments, operationalWithdrawals, cashRefunds) }
}

export function expectedCashAfterRefunds(openingCash: number, payments: readonly CashPaymentRow[], operationalWithdrawals = 0, cashRefunds = 0): number {
  return round2(expectedCashAfterOperationalWithdrawals(expectedCashFrom(openingCash, payments), operationalWithdrawals) - round2(cashRefunds))
}

function toShiftView(row: ShiftRow, payments: readonly CashPaymentRow[], ordersCount: number, operationalWithdrawals = 0, cashRefunds = 0): ShiftView {
  const { cashIn, cashOut } = computeShiftCashFlow(payments)
  // OPEN shifts show the LIVE expectation (payments keep landing); CLOSED
  // shifts show the value frozen at close time.
  const expected =
    row.status === 'open' ? expectedCashAfterRefunds(Number(row.openingCash), payments, operationalWithdrawals, cashRefunds) : Number(row.expectedCash)
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
    cashOut: money(cashOut + cashRefunds),
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
  let shift: ShiftRow
  try {
    shift = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shift-open:' || ${session.id} || ':' || ${branchId.toString()}))`
    const existing = await tx.shift.findFirst({
      where: { cashierId: session.id, branchId, status: 'open' },
      orderBy: { openedAt: 'desc' },
    })
    if (existing) throw new ShiftError('لديك بالفعل وردية مفتوحة لهذا الفرع', 409)

    if (isCashHandlingRole(session.role)) {
      const unresolved = await tx.cashHandover.findFirst({
        where: { branchId, toCashierId: session.id, OR: [{ status: { in: ['PENDING', 'DISPUTED'] } }, { status: { in: ['ACCEPTED', 'RESOLVED'] }, movementId: null }] },
        select: { id: true },
      })
      if (unresolved) throw new ShiftError('أكد استلام النقد أو سوِّ نزاع التسليم قبل فتح الوردية', 409)
    }

    // An approved cashier handover is the next opening float. It can only be
    // consumed once; a manual value is allowed only when there is no handover.
    const incoming = isCashHandlingRole(session.role) ? await tx.financialMovement.findMany({
      where: { branchId, type: 'cashier_handover', destinationUserId: session.id, consumedAt: null, status: 'posted' },
      orderBy: { occurredAt: 'asc' },
    }) : []
    const opening = incoming.length ? incoming.reduce((total, movement) => total + Math.round(Number(movement.amount) * 100), 0) / 100 : requestedOpening
    if (!handoverCountSchema.safeParse(opening).success) throw new ShiftError('رصيد التسليم يتجاوز حد الصندوق؛ يلزم تسوية منفصلة', 409)
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
    if (incoming.length) {
      const consumed = await tx.financialMovement.updateMany({ where: { id: { in: incoming.map((movement) => movement.id) }, branchId, destinationUserId: session.id, consumedAt: null, status: 'posted' }, data: { consumedAt: new Date() } })
      if (consumed.count !== incoming.length) throw new ShiftError('تغيّر رصيد النقد المسلم؛ أعد المحاولة', 409)
    }
    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId,
        action: 'shift.open',
        entityType: 'shift',
        entityId: created.id,
        newValues: { openingCash: opening.toFixed(2), openBy: session.name, role: session.role, handoverMovementId: incoming[0]?.id.toString() ?? null, handoverMovementIds: incoming.map((movement) => movement.id.toString()) },
      },
    })
      return created
    })
  } catch (error) {
    if (isOpenShiftUniquenessConflict(error)) {
      throw new ShiftError('لديك بالفعل وردية مفتوحة لهذا الفرع', 409)
    }
    throw error
  }

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
  if (isCashHandlingRole(session.role)) {
    if (!session.permissions.includes('orders.payment')) throw new ShiftError('غير مصرح بإغلاق عهدة نقدية', 403)
    if (!input || typeof input !== 'object' || !('closingCash' in input) || !handoverCountSchema.safeParse(input.closingCash).success) throw new ShiftError('عدّ الصندوق الفعلي مطلوب بدقة القرش', 400)
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
  let tableHandoffRecipient: { id: string; name: string } | null = null
  if (parsed.data.handoverRecipientId) {
    if (parsed.data.handoverRecipientId === session.id) throw new ShiftError('لا يمكنك تسليم الوردية لنفسك', 422)
    recipient = await prisma.user.findFirst({
      where: { id: parsed.data.handoverRecipientId, branchId: shift.branchId, isActive: true, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!recipient) throw new ShiftError('الموظف المستلم غير موجود أو غير نشط في نفس الفرع', 422)
  }

  // Financial totals are calculated after the common shift lock below.
  // Non-cash-handling roles (waiter, kitchen, manager-without-custody) close
  // operationally — no physical cash count, no cash reconciliation. Only
  // cash-handling roles (cashier; manager-with-explicit-custody) enter an
  // actual counted amount and produce a variance.

  // Outstanding work on this shift (non-terminal orders) — recorded in the
  // handover so the receiving employee knows what remains unresolved.

  const closed = await prisma.$transaction(async (tx) => {
    // All cash-affecting writers acquire this advisory lock before locking a
    // row. The reconciliation reads below therefore cannot miss a committed
    // payment or operational withdrawal for this shift.
    const locked = await lockAndReadShift(tx, shiftId)
    if (!locked || locked.cashierId !== session.id || locked.status !== 'open') {
      throw new ShiftError('الوردية مغلقة بالفعل', 409)
    }
    if (locked.branchId !== shift.branchId || !staffCanAccessBranch(session, locked.branchId)) throw new ShiftError('غير مصرح — الفرع غير متطابق', 403)
    const lockedShift = await tx.shift.findUnique({ where: { id: shiftId } })
    if (!lockedShift) throw new ShiftError('الوردية غير موجودة', 404)
      if (isCashHandlingRole(session.role)) {
        // سلفة الكاشير تبقى مسجلة عليه وتُستكمل لاحقًا؛ لا تُمنع إغلاق الوردية بسببها (per spec E2).
        if (recipient) {
        const eligible = await tx.user.findFirst({ where: { id: recipient.id, branchId: lockedShift.branchId, isActive: true, deletedAt: null }, select: { id: true } })
        if (!eligible) throw new ShiftError('المستلم لم يعد نشطًا في نفس الفرع', 422)
      }
    }
    const [cashState, outstandingOrders, waiterResponsibleOrders] = await Promise.all([
      readShiftCashState(tx, lockedShift),
      tx.order.findMany({
        where: { shiftId, status: { in: ['new', 'preparing', 'ready'] } },
        select: { orderNumber: true, status: true, total: true }, orderBy: { createdAt: 'asc' },
      }),
      session.role === ROLE.WAITER
        ? tx.order.findMany({ where: { branchId: lockedShift.branchId, responsibleWaiterId: session.id, status: { in: ['new','preparing','ready'] }, paymentStatus: { not: 'paid' } }, select: { id: true, cafeTableId: true } })
        : Promise.resolve([] as Array<{id:bigint;cafeTableId:bigint}>),
    ])
    const expected = cashState.expectedCash
    const cashHandling = isCashHandlingRole(session.role)
    const closing = cashHandling ? parsed.data.closingCash : 0
    const difference = cashHandling ? cashDifferenceOf(closing, expected) : 0
    // الويتر يمكنه إغلاق ورديته حتى لو بقيت طلبات معلقة؛ يتم تسجيلها في بيانات التسليم.
    if (session.role === ROLE.WAITER && (waiterResponsibleOrders?.length ?? 0) > 0 && !tableHandoffRecipient) throw new ShiftError('لديك طاولات/طلبات مفتوحة. اختر النادل الذي سيستلم الطاولات قبل إغلاق الوردية.', 409)
    if (session.role === ROLE.WAITER && (waiterResponsibleOrders?.length ?? 0) > 0 && tableHandoffRecipient) { const thr = tableHandoffRecipient as { id: string; name: string };
      const recvShift = await tx.shift.findFirst({ where: { cashierId: thr.id, branchId: lockedShift.branchId, status: 'open' }, select: { id: true } })
      if (!recvShift) throw new ShiftError('النادل المستلم للطاولات يجب أن تكون ورديته مفتوحة', 409)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('waiter-table-handoff:' || ${lockedShift.id.toString()}))`
      for (const order of (waiterResponsibleOrders ?? []) as Array<{id: bigint; cafeTableId: bigint}>) {
        await tx.order.update({ where: { id: order.id }, data: { responsibleWaiterId: thr.id } })
        await tx.orderResponsibilityHistory.create({ data: { orderId: order.id, branchId: lockedShift.branchId, assignedToId: thr.id, assignedById: session.id, source: 'shift_close_handoff', reason: `Shift close handoff to ${thr.name}` } })
      }
      await tx.auditLog.create({ data: { userId: session.id, branchId: lockedShift.branchId, action: 'shift.close.table_handoff', entityType: 'shift', entityId: shiftId, newValues: { recipientId: thr.id, recipientName: thr.name, transferredOrders: (waiterResponsibleOrders?.length ?? 0) } } })
    }
    const closedAt = new Date()
    const routeToSafe = crossedLocalMidnight(lockedShift.openedAt, closedAt, branch.timezone)
    // المستلم اختياري لأي دور — يمكن إغلاق الوردية بشكل طبيعي بدون اختيار مستلم.
    // جرد النقد يظل مطلوبًا للأدوار التي تتعامل مع النقد فقط.
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
      },
    })
    if (updated.count === 0) throw new ShiftError('الوردية مغلقة بالفعل', 409)

    if (cashHandling) {
      if (routeToSafe) {
        // Main Safe deposit — no recipient confirmation needed, money goes to
        // the safe not a till. Posted immediately.
        await tx.financialMovement.create({
          data: {
            branchId: lockedShift.branchId, type: 'main_safe_deposit', status: 'posted',
            amount: closing.toFixed(2), sourceAccount: 'CASHIER_TILL', destinationAccount: 'MAIN_SAFE',
            sourceShiftId: shiftId, destinationUserId: null, actorId: session.id,
            reason: parsed.data.handoverNotes || 'Shift close main safe deposit', occurredAt: closedAt,
            metadata: { route: 'main_safe_after_local_midnight', timezone: branch.timezone },
          },
        })
      } else if (recipient) {
        // Cashier-to-cashier handover — create PENDING CashHandover. The
        // recipient must explicitly accept before the cash is spendable. No
        // financial movement is posted until acceptance.
        const handover = await tx.cashHandover.create({
          data: {
            branchId: lockedShift.branchId,
            fromShiftId: shiftId,
            fromCashierId: session.id,
            toCashierId: recipient.id,
            amount: closing.toFixed(2),
            status: 'PENDING',
            notes: parsed.data.handoverNotes || null,
            createdAt: closedAt,
          },
        })
        await tx.auditLog.create({ data: {
          userId: session.id, branchId: lockedShift.branchId, action: 'cash_handover.create', entityType: 'cash_handover', entityId: handover.id,
          newValues: { status: 'PENDING', fromShiftId: shiftId.toString(), senderId: session.id, recipientId: recipient.id, declaredAmount: closing.toFixed(2), submittedAt: closedAt.toISOString() },
        } })
      }
    }

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: lockedShift.branchId,
        action: 'shift.close',
        entityType: 'shift',
        entityId: shiftId,
        newValues: {
          expectedCash: expected.toFixed(2),
          closingCash: closing.toFixed(2),
          cashDifference: difference.toFixed(2),
          operationalWithdrawals: cashState.operationalWithdrawals.toFixed(2),
          cashRefunds: cashState.cashRefunds.toFixed(2),
          cashHandling,
          handoverNotes: parsed.data.handoverNotes ?? null,
          handoverTo: routeToSafe ? 'MAIN_SAFE' : recipient?.name ?? null,
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

  const closedCash = await readShiftCashState(prisma, closed)
  return toShiftView(closed, closedCash.payments, 0, closedCash.operationalWithdrawals, closedCash.cashRefunds)
}

/** Pending cash handovers awaiting recipient action. Branch-scoped. */
export async function getPendingHandovers(
  session: StaffSession,
  branchIdRaw?: string,
  toCashierId?: string,
  statusRaw = 'PENDING',
): Promise<Array<{
  id: string; branchId: string; fromShiftId: string; fromCashierId: string;
  fromCashierName: string | null; toCashierId: string | null; amount: number;
  status: string; notes: string | null; createdAt: string;
  countedAmount: string | null; difference: string | null; disputeReason: string | null;
}>> {
  if (session.role !== ROLE.CASHIER && session.role !== ROLE.MANAGER && session.role !== ROLE.OWNER) throw new ShiftError('غير مصرح', 403)
  if (!isOwner(session.role) && !session.permissions.includes('orders.payment')) throw new ShiftError('غير مصرح', 403)
  if (session.role === ROLE.CASHIER && toCashierId && toCashierId !== session.id) throw new ShiftError('غير مصرح بعرض تسليمات مستلم آخر', 403)
  if (!isOwner(session.role) && branchIdRaw && branchIdRaw !== session.branchId) throw new ShiftError('غير مصرح — الفرع غير متطابق', 403)
  const status = z.enum(['PENDING', 'DISPUTED']).safeParse(statusRaw)
  if (!status.success) throw new ShiftError('حالة تسليم غير صالحة', 400)
  let branchId: bigint
  if (session.branchId !== null) {
    branchId = BigInt(session.branchId)
  } else if (branchIdRaw && /^\d+$/.test(branchIdRaw)) {
    branchId = BigInt(branchIdRaw)
    if (!staffCanAccessBranch(session, branchId)) throw new ShiftError('غير مصرح', 403)
  } else {
    throw new ShiftError('اختر الفرع', 400)
  }

  const handovers = await prisma.cashHandover.findMany({
    where: {
      branchId,
      status: status.data,
      ...(session.role === ROLE.CASHIER ? { toCashierId: session.id } : toCashierId ? { toCashierId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, fromShiftId: true, fromCashierId: true, toCashierId: true,
      amount: true, status: true, notes: true, createdAt: true, countedAmount: true, difference: true, disputeReason: true,
      fromCashier: { select: { name: true } },
    },
  })

  return handovers.map((h) => ({
    id: h.id.toString(),
    branchId: branchId.toString(),
    fromShiftId: h.fromShiftId.toString(),
    fromCashierId: h.fromCashierId,
    fromCashierName: h.fromCashier?.name ?? null,
    toCashierId: h.toCashierId ?? null,
    amount: Number(h.amount),
    status: h.status,
    notes: h.notes ?? null,
    createdAt: h.createdAt.toISOString(),
    countedAmount: h.countedAmount?.toFixed(2) ?? null,
    difference: h.difference?.toFixed(2) ?? null,
    disputeReason: h.disputeReason,
  }))
}

/** Never hand a cashier's personal float debt to the next cashier. The common
 * shift lock is already held, so concurrent advances/returns cannot race close. */
async function assertCashierAdvancesSettled(tx: Prisma.TransactionClient, actorId: string, branchId: bigint) {
  const advances = await tx.financialMovement.findMany({ where: { branchId, actorId, type: 'fixed_float_advance', status: 'posted' }, select: { id: true, amount: true } })
  if (!advances.length) return
  const returns = await tx.financialMovement.findMany({ where: { branchId, advanceId: { in: advances.map((a) => a.id) }, type: { in: ['fixed_float_return', 'fixed_float_settlement'] }, status: 'posted' }, select: { advanceId: true, amount: true } })
  for (const advance of advances) {
    const repaid = returns.filter((r) => r.advanceId === advance.id).reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0)
    if (Math.round(Number(advance.amount) * 100) > repaid) throw new ShiftError('يجب رد أو تسوية سلف العهدة المستحقة قبل إغلاق الوردية وتسليم النقد', 409)
  }
}

/** No schema change: original counts remain on CashHandover; resolution evidence
 * is appended to AuditLog and the new movement's metadata in the same transaction. */
export interface CashHandoverContext {
  confirmed?: boolean
  fromShiftId?: string
  branchId?: string
}

type HandoverRow = Prisma.CashHandoverGetPayload<{ include: { fromShift: true; movement: true } }>

function handoverBranch(session: StaffSession, context: CashHandoverContext, resolving: boolean): bigint {
  const authorizedRole = resolving
    ? session.role === ROLE.MANAGER || session.role === ROLE.OWNER
    : session.role === ROLE.CASHIER
  if (!authorizedRole || (!isOwner(session.role) && !session.permissions.includes('orders.payment'))) {
    throw new ShiftError('غير مصرح بإجراء تسليم النقد', 403)
  }
  const selected = context.branchId ?? session.branchId
  if (!selected || !/^\d+$/.test(selected)) throw new ShiftError('اختر الفرع', 400)
  const branchId = BigInt(selected)
  if (!staffCanAccessBranch(session, branchId)) throw new ShiftError('غير مصرح — الفرع غير متطابق', 403)
  if (context.confirmed !== true) throw new ShiftError('التأكيد الصريح للعدّ أو التسوية مطلوب', 400)
  if (context.fromShiftId && !/^\d+$/.test(context.fromShiftId)) throw new ShiftError('وردية غير صالحة', 400)
  return branchId
}

async function lockHandover(tx: Prisma.TransactionClient, id: string, branchId: bigint, context: CashHandoverContext): Promise<HandoverRow> {
  if (!/^\d+$/.test(id)) throw new ShiftError('تسليم غير صالح', 400)
  // Authorize scope BEFORE a write. The row lock serializes every transition,
  // including conflicting confirmation/dispute/resolution and response retries.
  const rows = await tx.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM cash_handovers
    WHERE id = ${BigInt(id)} AND branch_id = ${branchId}
    FOR UPDATE
  `
  if (!rows[0]) throw new ShiftError('تسليم النقد غير موجود', 404)
  const h = await tx.cashHandover.findUnique({ where: { id: rows[0].id }, include: { fromShift: true, movement: true } })
  if (!h || h.branchId !== branchId || (context.fromShiftId && h.fromShiftId !== BigInt(context.fromShiftId))) {
    throw new ShiftError('تسليم النقد غير موجود في هذه الوردية', 404)
  }
  if (h.fromShift.branchId !== branchId || h.fromShift.cashierId !== h.fromCashierId || h.fromShift.status !== 'closed' ||
      !h.toCashierId || h.toCashierId === h.fromCashierId || !handoverCountSchema.safeParse(Number(h.amount)).success) {
    throw new ShiftError('بيانات التسليم تتطلب مراجعة موثقة', 409)
  }
  if (h.movementId && (!h.movement || h.movement.branchId !== branchId || h.movement.type !== 'cashier_handover' || h.movement.sourceShiftId !== h.fromShiftId || h.movement.destinationUserId !== h.toCashierId)) {
    throw new ShiftError('ترابط حركة التسليم يتطلب مراجعة موثقة', 409)
  }
  return h
}

function requireHandoverRecipient(session: StaffSession, h: HandoverRow) {
  if (h.toCashierId !== session.id) throw new ShiftError('فقط المستلم المحدد يمكنه تأكيد العدّ أو رفض التسليم', 403)
}

async function requireEligibleHandoverRecipient(tx: Prisma.TransactionClient, h: HandoverRow) {
  const recipient = await tx.user.findFirst({
    where: { id: h.toCashierId!, branchId: h.branchId, isActive: true, deletedAt: null, role: { is: { slug: ROLE.CASHIER } } },
    select: { id: true },
  })
  if (!recipient) throw new ShiftError('المستلم لم يعد كاشيرًا نشطًا في نفس الفرع', 409)
}

function confirmedCount(value: unknown): number {
  const parsed = handoverCountSchema.safeParse(value)
  if (!parsed.success) throw new ShiftError('المبلغ المعدود غير صالح أو يتجاوز دقة القرش', 400)
  return Math.round(parsed.data * 100)
}

async function postHandoverMovement(tx: Prisma.TransactionClient, h: HandoverRow, session: StaffSession, amountCents: number, reason: string, at: Date) {
  if (h.movementId) throw new ShiftError('يوجد ترحيل سابق؛ يلزم إجراء تصحيح مستقل', 409)
  // Shares openShift's lock: an accepted transfer belongs to the NEXT opening,
  // never an unaccounted top-up of an already open drawer.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shift-open:' || ${h.toCashierId!} || ':' || ${h.branchId.toString()}))`
  const open = await tx.shift.findFirst({ where: { branchId: h.branchId, cashierId: h.toCashierId, status: 'open' }, select: { id: true } })
  if (open) throw new ShiftError('يجب إغلاق وردية المستلم الحالية قبل قبول نقد الوردية التالية', 409)
  const movement = await tx.financialMovement.create({
    data: {
      branchId: h.branchId, type: 'cashier_handover', status: 'posted',
      amount: (amountCents / 100).toFixed(2), sourceAccount: 'CASHIER_TILL', destinationAccount: 'CASHIER_TILL',
      sourceShiftId: h.fromShiftId, destinationUserId: h.toCashierId!, actorId: session.id,
      reason: 'Recipient-confirmed cash handover', occurredAt: at,
      metadata: { handoverId: h.id.toString(), declaredAmount: h.amount.toFixed(2), recipientCount: h.countedAmount?.toFixed(2) ?? (amountCents / 100).toFixed(2), resolutionReason: reason, confirmedBy: h.toCashierId },
    },
  })
  return movement
}

function handoverResult(h: { id: bigint; status: string; acceptedAt: Date | null; resolvedAt: Date | null; movementId: bigint | null }, idempotent = false) {
  return { id: h.id.toString(), status: h.status, acceptedAt: h.acceptedAt?.toISOString() ?? null, resolvedAt: h.resolvedAt?.toISOString() ?? null, movementId: h.movementId?.toString() ?? null, idempotent }
}

/** Equal counts accept once; a mismatch records immutable evidence and disputes
 * automatically. No cash is posted while the handover remains disputed. */
export async function acceptCashHandover(session: StaffSession, handoverIdRaw: string, countedAmount: number, context: CashHandoverContext = {}) {
  const branchId = handoverBranch(session, context, false)
  const cents = confirmedCount(countedAmount)
  return prisma.$transaction(async (tx) => {
    const h = await lockHandover(tx, handoverIdRaw, branchId, context)
    requireHandoverRecipient(session, h)
    await requireEligibleHandoverRecipient(tx, h)
    const difference = cents - Math.round(Number(h.amount) * 100)
    const status = difference === 0 ? 'ACCEPTED' : 'DISPUTED'
    if (h.status !== 'PENDING') {
      if (h.status === status && h.countedAmount !== null && Math.round(Number(h.countedAmount) * 100) === cents &&
          (status === 'ACCEPTED' ? h.movementId !== null : h.disputeReason === 'Recipient count differs from declared cash')) {
        return handoverResult(h, true)
      }
      throw new ShiftError('هذا التسليم عولج سابقًا؛ لا يمكن استبدال العدّ الأصلي', 409)
    }
    if (h.countedAmount !== null || h.difference !== null || h.movementId) throw new ShiftError('يوجد دليل سابق يتطلب مراجعة', 409)
    const now = new Date()
    const movement = status === 'ACCEPTED' ? await postHandoverMovement(tx, h, session, cents, '', now) : null
    const changed = await tx.cashHandover.updateMany({
      where: { id: h.id, branchId, toCashierId: session.id, status: 'PENDING', movementId: null, countedAmount: null },
      data: { status, countedAmount: (cents / 100).toFixed(2), difference: (difference / 100).toFixed(2),
        ...(movement ? { acceptedAt: now, movementId: movement.id } : { disputeReason: 'Recipient count differs from declared cash' }) },
    })
    if (changed.count !== 1) throw new ShiftError('تغيّرت حالة التسليم', 409)
    await tx.auditLog.create({ data: {
      userId: session.id, branchId, action: status === 'ACCEPTED' ? 'cash_handover.accept' : 'cash_handover.dispute',
      entityType: 'cash_handover', entityId: h.id,
      oldValues: { status: h.status, declaredAmount: h.amount.toFixed(2) },
      newValues: { status, declaredAmount: h.amount.toFixed(2), countedAmount: (cents / 100).toFixed(2), difference: (difference / 100).toFixed(2), confirmed: true, confirmedAt: now.toISOString(), movementId: movement?.id.toString() ?? null, automaticDiscrepancy: difference !== 0 },
    } })
    return handoverResult({ ...h, status, acceptedAt: movement ? now : null, movementId: movement?.id ?? null })
  })
}

/** Rejecting cash is a dispute, not a new financial state. Legacy disputes with
 * no count may receive their FIRST recipient count, never overwrite one. */
export async function disputeCashHandover(session: StaffSession, handoverIdRaw: string, disputeReason: string, countedAmount?: number, context: CashHandoverContext = {}) {
  const branchId = handoverBranch(session, context, false)
  const cents = confirmedCount(countedAmount)
  const parsedReason = z.string().trim().min(3).max(1000).safeParse(disputeReason)
  if (!parsedReason.success) throw new ShiftError('سبب النزاع مطلوب', 400)
  return prisma.$transaction(async (tx) => {
    const h = await lockHandover(tx, handoverIdRaw, branchId, context)
    requireHandoverRecipient(session, h)
    await requireEligibleHandoverRecipient(tx, h)
    if (h.status === 'DISPUTED' && h.countedAmount !== null && Number(h.countedAmount).toFixed(2) === (cents / 100).toFixed(2) && h.disputeReason === parsedReason.data && !h.movementId) return handoverResult(h, true)
    if (!['PENDING', 'DISPUTED'].includes(h.status) || h.countedAmount !== null || h.difference !== null || h.movementId) {
      throw new ShiftError('لا يمكن استبدال دليل نزاع أو عدّ سابق', 409)
    }
    const now = new Date()
    const difference = cents - Math.round(Number(h.amount) * 100)
    const changed = await tx.cashHandover.updateMany({
      where: { id: h.id, branchId, toCashierId: session.id, status: h.status, countedAmount: null, movementId: null },
      data: { status: 'DISPUTED', countedAmount: (cents / 100).toFixed(2), difference: (difference / 100).toFixed(2), disputeReason: h.disputeReason ?? parsedReason.data },
    })
    if (changed.count !== 1) throw new ShiftError('تغيّرت حالة التسليم', 409)
    await tx.auditLog.create({ data: {
      userId: session.id, branchId, action: 'cash_handover.dispute', entityType: 'cash_handover', entityId: h.id,
      oldValues: { status: h.status, disputeReason: h.disputeReason },
      newValues: { status: 'DISPUTED', declaredAmount: h.amount.toFixed(2), countedAmount: (cents / 100).toFixed(2), difference: (difference / 100).toFixed(2), disputeReason: parsedReason.data, confirmed: true, confirmedAt: now.toISOString() },
    } })
    return handoverResult({ ...h, status: 'DISPUTED' })
  })
}

/** An independent Manager/Owner can release only the amount the recipient
 * actually confirmed. Changing that count requires a separate correction flow. */
export async function resolveCashHandover(session: StaffSession, handoverIdRaw: string, resolvedAmount: number, resolutionNote: string, context: CashHandoverContext = {}) {
  const branchId = handoverBranch(session, context, true)
  const cents = confirmedCount(resolvedAmount)
  const note = z.string().trim().min(3).max(500).safeParse(resolutionNote)
  if (!note.success) throw new ShiftError('سبب التسوية مطلوب', 400)
  return prisma.$transaction(async (tx) => {
    const h = await lockHandover(tx, handoverIdRaw, branchId, context)
    if (session.id === h.fromCashierId || session.id === h.toCashierId) throw new ShiftError('يلزم اعتماد مستقل عن طرفي التسليم', 403)
    await requireEligibleHandoverRecipient(tx, h)
    if (h.status === 'RESOLVED' && h.resolvedById === session.id && h.movement && Math.round(Number(h.movement.amount) * 100) === cents &&
        h.movement.metadata && typeof h.movement.metadata === 'object' && !Array.isArray(h.movement.metadata) && h.movement.metadata.resolutionReason === note.data) return handoverResult(h, true)
    if (h.status !== 'DISPUTED' || h.movementId || h.countedAmount === null || h.difference === null) {
      throw new ShiftError('يلزم نزاع بلا ترحيل وعدّ مؤكد من المستلم قبل التسوية', 409)
    }
    if (Math.round(Number(h.countedAmount) * 100) !== cents) throw new ShiftError('لا يمكن للتسوية تغيير العدّ الذي أكده المستلم', 409)
    const now = new Date()
    const movement = await postHandoverMovement(tx, h, session, cents, note.data, now)
    const changed = await tx.cashHandover.updateMany({
      where: { id: h.id, branchId, status: 'DISPUTED', movementId: null },
      data: { status: 'RESOLVED', resolvedById: session.id, resolvedAt: now, movementId: movement.id },
    })
    if (changed.count !== 1) throw new ShiftError('تغيّرت حالة التسليم', 409)
    await tx.auditLog.create({ data: {
      userId: session.id, branchId, action: 'cash_handover.resolve', entityType: 'cash_handover', entityId: h.id,
      oldValues: { status: h.status, declaredAmount: h.amount.toFixed(2), countedAmount: h.countedAmount.toFixed(2), difference: h.difference.toFixed(2), disputeReason: h.disputeReason },
      newValues: { status: 'RESOLVED', resolvedAmount: (cents / 100).toFixed(2), resolutionNote: note.data, resolvedAt: now.toISOString(), movementId: movement.id.toString(), recipientId: h.toCashierId },
    } })
    return handoverResult({ ...h, status: 'RESOLVED', resolvedAt: now, movementId: movement.id })
  })
}

/**
 * Require an open shift for the acting employee on their branch. Returns the
 * shift or throws a 409 ShiftError. Owner is exempt; Manager requires an open
 * shift for operational work (operational shift, not cash custody).
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
      where: { branchId, isActive: true, deletedAt: null },
      orderBy: { name: 'asc' }, select: { id: true, name: true },
    }),
  ])

  const shiftIds = recent.map((s) => s.id)
  const [payments, orderCounts, withdrawalRows, refundRows] = await Promise.all([
    shiftIds.length
      ? prisma.payment.findMany({
          where: { branchId, shiftId: { in: shiftIds } },
          select: { shiftId: true, method: true, status: true, amount: true },
        })
      : Promise.resolve([]),
    shiftIds.length
      ? prisma.order.groupBy({ by: ['shiftId'], where: { shiftId: { in: shiftIds } }, _count: true })
      : Promise.resolve([]),
    shiftIds.length
      ? prisma.financialMovement.groupBy({ by: ['sourceShiftId'], where: { branchId, sourceShiftId: { in: shiftIds }, type: 'operational_withdrawal', status: 'posted' }, _sum: { amount: true } })
      : Promise.resolve([]),
    shiftIds.length
      ? prisma.financialMovement.groupBy({ by: ['sourceShiftId'], where: { branchId, sourceShiftId: { in: shiftIds }, type: 'cash_refund', status: 'posted', sourceAccount: 'CASHIER_TILL', destinationAccount: 'CUSTOMER' }, _sum: { amount: true } })
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
  const refundsByShift = new Map<string, number>()
  for (const row of refundRows) if (row.sourceShiftId !== null) refundsByShift.set(row.sourceShiftId.toString(), Number(row._sum.amount ?? 0))

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
      refundsByShift.get(row.id.toString()) ?? 0,
    )

  return {
    branchId: branchId.toString(),
    userRole: session.role,
    branches: branches.map((b) => ({ id: b.id.toString(), name: b.name })),
    cashiers: cashiers.map((user) => ({ id: user.id, name: user.name })),
    current: current ? viewOf(current) : null,
    currentOrders,
    recent: recent.map(viewOf),
    waiterOpenTables: session.role === ROLE.WAITER && current ? await (async ()=>{ const rows=await prisma.order.findMany({ where: { branchId, responsibleWaiterId: session.id, status: { in: ['new','preparing','ready'] }, paymentStatus: { not: 'paid' } }, select: { cafeTableId: true } }); const ids=[...new Set(rows.map(r=>r.cafeTableId.toString()))]; const tables=ids.length?await prisma.cafeTable.findMany({where:{id:{in:ids.map(id=>BigInt(id))},branchId},select:{id:true,number:true}}):[]; const nameById=new Map(tables.map(x=>[x.id.toString(),x.number])); return rows.reduce((acc:Array<{tableId:string;tableNumber:string;ordersCount:number}>,o)=>{const tid=o.cafeTableId.toString();const row=acc.find(x=>x.tableId===tid);const tn=nameById.get(tid)??tid; if(row) row.ordersCount++; else acc.push({tableId:tid,tableNumber:tn,ordersCount:1}); return acc},[]).sort((a,b)=>a.tableNumber.localeCompare(b.tableNumber,'ar',{numeric:true})) })() : [],
    handoffRecipients: cashiers.filter((u)=>u.id!==session.id).map((u)=>({id:u.id,name:u.name,role:'staff'})),
  }
}
