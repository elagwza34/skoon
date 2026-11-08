import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { notifyRole } from '@/lib/notifications'
import { getOpenShift, readShiftCashState } from '@/lib/staff-shifts'
import { lockAndReadShift, type LockedOpenShift } from '@/lib/financial-shift-lock'

/**
 * Payments write — server-only. Money is NEVER accepted from the client.
 *
 * The client may only pick a method and (for cash) how much was tendered. The
 * amount PAID is computed server-side from the order's outstanding balance
 * (total − completed payments), so a tampered client cannot underpay, overpay
 * into another order, or double-pay the same order.
 *
 * V1 model (audit decision: no partial payments yet — every finalize covers the
 * full outstanding balance; the outstanding check below rejects anything else):
 *   finalize → one Payment row covering the full outstanding amount;
 *              order.paymentStatus = 'paid'
 *   refund   → every completed payment of the order is marked 'refunded';
 *              order.paymentStatus = 'refunded'   (manager+ only)
 *              NOTE: this flips a DB status only. External money movement
 *              (cash drawer, card reversal, online gateway refund) is a MANUAL
 *              operator step — the UI/API must never claim funds left the
 *              business. The receipt text and docs say "استرداد داخلي مسجل".
 *
 * Concurrency: the order row is locked with SELECT … FOR UPDATE inside the
 * transaction, so two cashiers cannot finalize the same order simultaneously.
 */

export class PaymentError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'PaymentError'
    this.status = status
  }
}

/** Canonical persisted values. `card`/`online` remain valid for legacy rows. */
export const PAYMENT_METHODS = ['cash', 'mobile_wallet', 'instapay', 'card', 'online', 'electronic_wallet', 'card_pos'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  mobile_wallet: 'محفظة إلكترونية',
  instapay: 'إنستا باي',
  card: 'بطاقة',
  online: 'أونلاين',
  electronic_wallet: 'محفظة إلكترونية',
  card_pos: 'بطاقة نقطة بيع',
}

/** Input contract shared by the payment API and regression tests. */
export const paymentCollectionSchema = z.object({
  method: z.enum(PAYMENT_METHODS, {
    errorMap: () => ({ message: 'طريقة الدفع غير صالحة' }),
  }),
  // Cash only: tendered amount (>= outstanding). Non-cash methods settle the
  // server-calculated outstanding balance after an explicit cashier attestation.
  received: z.coerce.number().positive('المبلغ المستلم يجب أن يكون أكبر من صفر').max(9_999_999).optional(),
  // Manual operator attestation that the electronic payment was received.
  // Not sufficient by itself — server records confirming employee + timestamp.
  electronicPaymentConfirmed: z.boolean().optional(),
  // External transaction reference for electronic payments (required).
  externalTransactionReference: z.string().trim().min(1).max(100).optional(),
  confirmationNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).superRefine((value, context) => {
  const electronic = value.method !== 'cash'
  if (value.method === 'cash' && value.received === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['received'], message: 'المبلغ المستلم مطلوب للدفع النقدي' })
  }
  if (electronic) {
    if (value.electronicPaymentConfirmed !== true) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['electronicPaymentConfirmed'], message: 'يجب تأكيد استلام الدفع الإلكتروني' })
    }
    if (!value.externalTransactionReference) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['externalTransactionReference'], message: 'مرجع المعاملة الخارجية مطلوب للدفع الإلكتروني' })
    }
  }
})

export const refundSchema = z.object({
  reason: z.string().trim().min(3, 'سبب الاسترداد مطلوب (3 أحرف على الأقل)').max(255),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

export interface PaymentResult {
  orderId: string
  orderNumber: string
  paymentId: string
  method: PaymentMethod
  amount: string
  changeAmount: string
  paymentStatus: string
}

/** Finalize payment for an order — cashier+ only, branch-scoped. */
export async function finalizeOrderPayment(
  session: StaffSession,
  orderIdRaw: string,
  input: unknown,
): Promise<PaymentResult> {
  if (session.role !== ROLE.OWNER && session.role !== ROLE.CASHIER) throw new PaymentError('غير مصرح — التحصيل النقدي للكاشير أو المالك فقط', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new PaymentError('الطلب غير موجود', 404)

  const parsed = paymentCollectionSchema.safeParse(input)
  if (!parsed.success) throw new PaymentError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { method } = parsed.data

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderIdRaw) },
    select: { id: true, branchId: true, orderNumber: true, status: true },
  })
  if (!order) throw new PaymentError('الطلب غير موجود', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new PaymentError('غير مصرح', 403)

  const collectionKey = parsed.data.idempotencyKey
  const collectionFingerprint = createHash('sha256').update(JSON.stringify({ orderId: orderIdRaw, method, received: parsed.data.received ?? null })).digest('hex')
  if (collectionKey) {
    const prior = await prisma.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType: 'payment_collection', idempotencyKey: collectionKey } } })
    if (prior) { if (prior.fingerprint !== collectionFingerprint) throw new PaymentError('Idempotency key was reused with a different request', 409); return prior.result as unknown as PaymentResult }
  }

  // Operational staff collect only inside their shift. Manager/Owner retain
  // their existing financial authority without being forced into a till shift.
  const openShift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, order.branchId) : null
  if (requiresOperationalShift(session.role) && !openShift) {
    throw new PaymentError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)
  }
  if (order.status === 'cancelled') throw new PaymentError('لا يمكن تحصيل طلب ملغي', 409)

  return prisma.$transaction(async (tx) => {
    // The pre-transaction lookup above supplies only a stable advisory-lock
    // key. Re-checking after that common lock prevents a payment from being
    // linked to a till that a concurrent close has already frozen.
    const lockedOpenShift = requiresOperationalShift(session.role)
      ? await lockAndReadShift(tx, openShift!.id)
      : null
    if (requiresOperationalShift(session.role) && (!lockedOpenShift || lockedOpenShift.status !== 'open' || lockedOpenShift.cashierId !== session.id || lockedOpenShift.branchId !== order.branchId)) {
      throw new PaymentError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولاً من صفحة الورديات (/shifts)', 409)
    }
    // Lock the order row for the duration of the transaction.
    const locked = await tx.$queryRaw<{ total: unknown; status: string }[]>`
      SELECT total, status FROM orders WHERE id = ${order.id} FOR UPDATE
    `
    if (!locked[0] || locked[0].status === 'cancelled') throw new PaymentError('لا يمكن تحصيل طلب ملغي', 409)
    const total = Number(locked[0]?.total ?? 0)

    const paidAgg = await tx.payment.aggregate({
      where: { orderId: order.id, status: 'completed' },
      _sum: { amount: true },
    })
    const paid = Number(paidAgg._sum.amount ?? 0)
    const outstanding = round2(total - paid)
    if (outstanding <= 0) throw new PaymentError('الطلب مدفوع بالفعل', 409)

    let received = outstanding
    if (method === 'cash') {
      received = parsed.data.received!
      if (received < outstanding) throw new PaymentError('المبلغ المستلم أقل من المطلوب', 400)
    }
    const change = method === 'cash' ? round2(received - outstanding) : 0

    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        branchId: order.branchId,
        shiftId: lockedOpenShift?.id ?? null,
        method,
        amount: outstanding.toFixed(2),
        amountDue: outstanding.toFixed(2),
        changeAmount: change.toFixed(2),
        status: 'completed',
        paidById: session.id,
      },
      select: { id: true },
    })

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'paid' },
    })

    // The invoice is now collected — nudge the manager (and owner, cross-branch)
    // so supervision sees the completed sale. Same tx as the payment.
    await notifyRole(tx, ROLE.MANAGER, order.branchId, {
      type: 'order.paid',
      title: `تم تحصيل الفاتورة ${order.orderNumber}`,
      orderId: order.id,
    })

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: order.branchId,
        action: 'payment.finalize',
        entityType: 'order',
        entityId: order.id,
        newValues: {
          paymentId: payment.id.toString(),
          method,
          amount: outstanding.toFixed(2),
          change: change.toFixed(2),
        },
      },
    })

    const result = {
      orderId: order.id.toString(),
      orderNumber: order.orderNumber,
      paymentId: payment.id.toString(),
      method,
      amount: outstanding.toFixed(2),
      changeAmount: change.toFixed(2),
      paymentStatus: 'paid',
    }
    if (collectionKey) await tx.financialOperation.create({ data: { branchId: order.branchId, actorId: session.id, operationType: 'payment_collection', idempotencyKey: collectionKey, fingerprint: collectionFingerprint, result } })
    return result
  })
}

/** Electronic payment confirmation — server-side attestation only.
 *
 * The cashier personally verifies the customer transferred/paid the money
 * outside Skoon, then confirms inside Skoon. The client checkbox is an
 * operator attestation, NOT independent bank verification.
 *
 * Stores confirmedById, confirmedAt, externalTransactionReference,
 * confirmationNote on the Payment record.
 */
export async function confirmElectronicPayment(
  session: StaffSession,
  orderIdRaw: string,
  input: unknown,
): Promise<PaymentResult> {
  if (session.role !== ROLE.OWNER && session.role !== ROLE.CASHIER) throw new PaymentError('غير مصرح — تأكيد الدفع الإلكتروني للكاشير أو المالك فقط', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new PaymentError('الطلب غير موجود', 404)

  const parsed = paymentCollectionSchema.safeParse(input)
  if (!parsed.success) throw new PaymentError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { method, externalTransactionReference, confirmationNote } = parsed.data
  if (method === 'cash') throw new PaymentError('استخدم finalizar الدفع للنقدي', 400)
  if (!externalTransactionReference) throw new PaymentError('مرجع المعاملة الخارجية مطلوب', 400)
  if (parsed.data.electronicPaymentConfirmed !== true) throw new PaymentError('يجب تأكيد استلام الدفع الإلكتروني', 400)

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderIdRaw) },
    select: { id: true, branchId: true, orderNumber: true, status: true, paymentStatus: true },
  })
  if (!order) throw new PaymentError('الطلب غير موجود', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new PaymentError('غير مصرح', 403)
  if (order.status === 'cancelled') throw new PaymentError('لا يمكن تحصيل طلب ملغي', 409)
  if (order.paymentStatus === 'paid') throw new PaymentError('الطلب مدفوع بالفعل', 409)

  const collectionKey = parsed.data.idempotencyKey
  const collectionFingerprint = createHash('sha256').update(JSON.stringify({ orderId: orderIdRaw, method, externalTransactionReference })).digest('hex')
  if (collectionKey) {
    const prior = await prisma.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType: 'payment_confirm_electronic', idempotencyKey: collectionKey } } })
    if (prior) { if (prior.fingerprint !== collectionFingerprint) throw new PaymentError('مفتاح العملية استُخدم لطلب مختلف', 409); return prior.result as unknown as PaymentResult }
  }

  // Reject duplicate external reference for the same branch/method scope
  // (different providers are not treated as duplicates of each other).
  const existingRef = await prisma.payment.findFirst({
    where: {
      branchId: order.branchId,
      method,
      transactionRef: externalTransactionReference,
      status: 'completed',
    },
    select: { id: true },
  })
  if (existingRef) throw new PaymentError('مرجع المعاملة الخارجية مستخدم بالفعل لدفعة مكتملة', 409)

  const openShift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, order.branchId) : null
  if (requiresOperationalShift(session.role) && !openShift) {
    throw new PaymentError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)
  }

  return prisma.$transaction(async (tx) => {
    const lockedOpenShift = requiresOperationalShift(session.role)
      ? await lockAndReadShift(tx, openShift!.id)
      : null
    if (requiresOperationalShift(session.role) && (!lockedOpenShift || lockedOpenShift.status !== 'open' || lockedOpenShift.cashierId !== session.id || lockedOpenShift.branchId !== order.branchId)) {
      throw new PaymentError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولاً من صفحة الورديات (/shifts)', 409)
    }

    const locked = await tx.$queryRaw<{ total: unknown; status: string; payment_status: string }[]>`
      SELECT total, status, payment_status FROM orders WHERE id = ${order.id} FOR UPDATE
    `
    if (!locked[0] || locked[0].status === 'cancelled') throw new PaymentError('لا يمكن تحصيل طلب ملغي', 409)
    if (locked[0].payment_status === 'paid') throw new PaymentError('الطلب مدفوع بالفعل', 409)
    const total = Number(locked[0]?.total ?? 0)

    const paidAgg = await tx.payment.aggregate({
      where: { orderId: order.id, status: 'completed' },
      _sum: { amount: true },
    })
    const paid = Number(paidAgg._sum.amount ?? 0)
    const outstanding = round2(total - paid)
    if (outstanding <= 0) throw new PaymentError('الطلب مدفوع بالفعل', 409)

    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        branchId: order.branchId,
        shiftId: lockedOpenShift?.id ?? null,
        method,
        amount: outstanding.toFixed(2),
        amountDue: outstanding.toFixed(2),
        changeAmount: '0.00',
        status: 'completed',
        paidById: session.id,
        confirmedById: session.id,
        confirmedAt: new Date(),
        confirmationNote: confirmationNote?.trim() || null,
        transactionRef: externalTransactionReference,
      },
      select: { id: true },
    })

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'paid' },
    })

    await notifyRole(tx, ROLE.MANAGER, order.branchId, {
      type: 'order.paid',
      title: `تم تحصيل الفاتورة ${order.orderNumber} (إلكتروني)`,
      orderId: order.id,
    })

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: order.branchId,
        action: 'payment.confirm_electronic',
        entityType: 'order',
        entityId: order.id,
        newValues: {
          paymentId: payment.id.toString(),
          method,
          amount: outstanding.toFixed(2),
          externalTransactionReference,
          confirmedBy: session.id,
          confirmedAt: new Date().toISOString(),
        },
      },
    })

    const result = {
      orderId: order.id.toString(),
      orderNumber: order.orderNumber,
      paymentId: payment.id.toString(),
      method,
      amount: outstanding.toFixed(2),
      changeAmount: '0.00',
      paymentStatus: 'paid',
    }
    if (collectionKey) await tx.financialOperation.create({ data: { branchId: order.branchId, actorId: session.id, operationType: 'payment_confirm_electronic', idempotencyKey: collectionKey, fingerprint: collectionFingerprint, result } })
    return result
  })
}

// ============================================================================
// REFUND LIFECYCLE
// REQUESTED -> APPROVED -> PENDING_EXECUTION -> COMPLETED / FAILED / CANCELLED
// ============================================================================

export const refundRequestSchema = z.object({
  orderId: z.string().regex(/^\d+$/),
  paymentId: z.string().regex(/^\d+$/),
  amount: z.coerce.number().positive('مبلغ الاسترداد يجب أن يكون أكبر من صفر').max(9_999_999)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'مبلغ الاسترداد يجب أن يكون بدقة القرش'),
  reason: z.string().trim().min(3, 'سبب الاسترداد مطلوب (3 أحرف على الأقل)').max(500),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

export const refundDecideSchema = z.object({
  refundId: z.string().regex(/^\d+$/),
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
})

export const refundExecuteSchema = z.object({
  refundId: z.string().regex(/^\d+$/),
  // Cash refund: confirm actual cash disbursement.
  // Electronic refund: external refund reference + evidence note.
  externalReference: z.string().trim().min(1).max(100).optional(),
  evidenceNote: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

export const refundCancelSchema = z.object({
  refundId: z.string().regex(/^\d+$/),
  reason: z.string().trim().min(3).max(500).optional(),
})

export interface RefundResult {
  refundId: string
  orderId: string
  orderNumber: string
  paymentId: string
  amount: string
  method: PaymentMethod
  status: string
}

const REFUND_STATUSES = ['REQUESTED', 'APPROVED', 'PENDING_EXECUTION', 'COMPLETED', 'FAILED', 'CANCELLED'] as const
type RefundStatus = (typeof REFUND_STATUSES)[number]

function isRefundStatus(v: string): v is RefundStatus {
  return REFUND_STATUSES.includes(v as RefundStatus)
}

/** Serialize all lifecycle writers on the source payment, then the refund. */
async function lockRefundPayment(tx: Prisma.TransactionClient, paymentId: bigint, branchId: bigint) {
  const rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM payments WHERE id = ${paymentId} AND branch_id = ${branchId} FOR UPDATE`
  if (!rows.length) throw new PaymentError('الدفعة غير موجودة في الفرع', 404)
}

async function lockRefund(tx: Prisma.TransactionClient, refundId: bigint, paymentId: bigint, branchId: bigint) {
  const rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM refunds WHERE id = ${refundId} AND payment_id = ${paymentId} AND branch_id = ${branchId} FOR UPDATE`
  if (!rows.length) throw new PaymentError('الاسترداد غير موجود في الفرع والدفعة', 404)
  const refund = await tx.refund.findUnique({ where: { id: refundId } })
  if (!refund || refund.branchId !== branchId || refund.paymentId !== paymentId) throw new PaymentError('تغير ربط الاسترداد', 409)
  return refund
}

/** Refundable balance = original payment amount minus completed refunds. */
async function refundableBalance(tx: Prisma.TransactionClient, paymentId: bigint): Promise<number> {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { amount: true } })
  if (!payment) throw new PaymentError('الدفعة الأصلية غير موجودة', 404)
  const completed = await tx.refund.aggregate({
    where: { paymentId, status: 'COMPLETED' },
    _sum: { amount: true },
  })
  return round2(Number(payment.amount) - Number(completed._sum.amount ?? 0))
}

/** Reservable balance = original minus (REQUESTED + APPROVED + PENDING_EXECUTION + COMPLETED). */
async function reservableBalance(tx: Prisma.TransactionClient, paymentId: bigint): Promise<number> {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { amount: true } })
  if (!payment) throw new PaymentError('الدفعة الأصلية غير موجودة', 404)
  const reserved = await tx.refund.aggregate({
    where: { paymentId, status: { in: ['REQUESTED', 'APPROVED', 'PENDING_EXECUTION', 'COMPLETED'] } },
    _sum: { amount: true },
  })
  return round2(Number(payment.amount) - Number(reserved._sum.amount ?? 0))
}

/** Request a refund — cashier+ can request, creates REQUESTED record. */
export async function requestRefund(
  session: StaffSession,
  orderIdRaw: string,
  input: unknown,
): Promise<RefundResult> {
  if (!hasAtLeast(session.role, ROLE.CASHIER)) throw new PaymentError('غير مصرح', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new PaymentError('الطلب غير موجود', 404)

  const parsed = refundRequestSchema.safeParse(input)
  if (!parsed.success) throw new PaymentError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { paymentId, amount, reason } = parsed.data

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderIdRaw) },
    select: { id: true, branchId: true, orderNumber: true, paymentStatus: true },
  })
  if (!order) throw new PaymentError('الطلب غير موجود', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new PaymentError('غير مصرح', 403)
  if (order.paymentStatus !== 'paid') throw new PaymentError('الطلب غير مدفوع — لا يوجد ما يُسترد', 409)

  const payment = await prisma.payment.findUnique({ where: { id: BigInt(paymentId) }, select: { id: true, orderId: true, branchId: true, status: true, amount: true, method: true } })
  if (!payment) throw new PaymentError('الدفعة الأصلية غير موجودة', 404)
  if (payment.orderId !== order.id) throw new PaymentError('الدفعة لا تعود لهذا الطلب', 409)
  if (payment.branchId !== order.branchId) throw new PaymentError('الدفعة تعود لفرع آخر', 403)
  if (payment.status !== 'completed') throw new PaymentError('الدفعة الأصلية غير مكتملة', 409)

  const key = parsed.data.idempotencyKey
  const fingerprint = createHash('sha256').update(JSON.stringify({ orderId: orderIdRaw, paymentId, amount, reason })).digest('hex')
  if (key) {
    const prior = await prisma.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType: 'refund_request', idempotencyKey: key } } })
    if (prior) { if (prior.fingerprint !== fingerprint) throw new PaymentError('مفتاح العملية استُخدم لطلب مختلف', 409); return prior.result as unknown as RefundResult }
  }

  return prisma.$transaction(async (tx) => {
    await lockRefundPayment(tx, BigInt(paymentId), order.branchId)
    const lockedPayment = await tx.payment.findUnique({ where: { id: BigInt(paymentId) } })
    if (!lockedPayment || lockedPayment.status !== 'completed' || lockedPayment.orderId !== order.id || lockedPayment.branchId !== order.branchId || lockedPayment.method !== payment.method) throw new PaymentError('تغيرت الدفعة الأصلية', 409)
    if (key) {
      const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType: 'refund_request', idempotencyKey: key } } })
      if (prior) { if (prior.fingerprint !== fingerprint) throw new PaymentError('مفتاح العملية استُخدم لطلب مختلف', 409); return prior.result as unknown as RefundResult }
    }

    const currentReservable = await reservableBalance(tx, BigInt(paymentId))
    if (amount > currentReservable) throw new PaymentError('مبلغ الاسترداد يتجاوز الرصيد القابل للاسترداد', 409)

    const refund = await tx.refund.create({
      data: {
        branchId: order.branchId,
        orderId: order.id,
        paymentId: BigInt(paymentId),
        amount: amount.toFixed(2),
        method: payment.method as PaymentMethod,
        status: 'REQUESTED',
        reason: reason.trim(),
        requestedById: session.id,
        idempotencyKey: key ?? createHash('sha256').update(`${session.id}:${Date.now()}:${Math.random()}`).digest('hex'),
      },
      select: { id: true, amount: true, method: true, status: true },
    })

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: order.branchId,
        action: 'refund.request',
        entityType: 'refund',
        entityId: refund.id,
        newValues: {
          refundId: refund.id.toString(),
          orderId: order.id.toString(),
          paymentId: paymentId,
          amount: refund.amount.toString(),
          method: refund.method,
          reason: reason.trim(),
        },
      },
    })

    const result: RefundResult = {
      refundId: refund.id.toString(),
      orderId: order.id.toString(),
      orderNumber: order.orderNumber,
      paymentId: paymentId,
      amount: refund.amount.toString(),
      method: payment.method as PaymentMethod,
      status: refund.status,
    }
    if (key) await tx.financialOperation.create({ data: { branchId: order.branchId, actorId: session.id, operationType: 'refund_request', idempotencyKey: key, fingerprint, result: result as unknown as Prisma.InputJsonValue } })
    return result
  })
}

/** Approve or reject a refund — manager+ only. Requester cannot approve their own. */
export async function decideRefund(
  session: StaffSession,
  input: unknown,
): Promise<RefundResult> {
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new PaymentError('غير مصرح — одобрение الاسترداد للمدير أو المالك فقط', 403)

  const parsed = refundDecideSchema.safeParse(input)
  if (!parsed.success) throw new PaymentError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { refundId, approve, note } = parsed.data

  const refund = await prisma.refund.findUnique({ where: { id: BigInt(refundId) }, select: { id: true, branchId: true, status: true, requestedById: true, amount: true, orderId: true, paymentId: true, method: true } })
  if (!refund) throw new PaymentError('طلب الاسترداد غير موجود', 404)
  if (!staffCanAccessBranch(session, refund.branchId)) throw new PaymentError('غير مصرح', 403)
  if (refund.status !== 'REQUESTED') throw new PaymentError('لا يمكن اتخاذ قرار على طلب استرداد غير مطلوب', 409)
  if (refund.requestedById === session.id) throw new PaymentError('لا يمكن الموافقة على استرداد طلبك بنفسك', 403)

  const order = await prisma.order.findUnique({ where: { id: refund.orderId }, select: { orderNumber: true } })

  return prisma.$transaction(async (tx) => {
    await lockRefundPayment(tx, refund.paymentId, refund.branchId)
    const current = await lockRefund(tx, refund.id, refund.paymentId, refund.branchId)
    if (!current || current.status !== 'REQUESTED') throw new PaymentError('تغيرت حالة طلب الاسترداد؛ حدّث الصفحة', 409)
    if (current.requestedById === session.id) throw new PaymentError('لا يمكن الموافقة على استرداد طلبك بنفسك', 403)

    const changed = await tx.refund.updateMany({
      where: { id: current.id, branchId: refund.branchId, status: 'REQUESTED' },
      data: {
        status: approve ? 'APPROVED' : 'CANCELLED',
        ...(approve ? { approvedById: session.id, approvedAt: new Date() } : {}),
      },
    })
    if (changed.count !== 1) throw new PaymentError('تغيرت حالة الاسترداد', 409)
    const updated = { ...current, status: approve ? 'APPROVED' : 'CANCELLED' }

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: refund.branchId,
        action: approve ? 'refund.approve' : 'refund.reject',
        entityType: 'refund',
        entityId: refund.id,
        newValues: {
          refundId: refund.id.toString(),
          decision: approve ? 'approved' : 'rejected',
          note: note?.trim() || null,
          approvedBy: approve ? session.id : null,
        },
      },
    })

    return {
      refundId: updated.id.toString(),
      orderId: refund.orderId.toString(),
      orderNumber: order?.orderNumber ?? '',
      paymentId: refund.paymentId.toString(),
      amount: updated.amount.toString(),
      method: updated.method as PaymentMethod,
      status: updated.status,
    }
  })
}

/** Execute a refund — cashier+ for cash, manager+ for electronic.
 * Cash: requires open shift + sufficient till cash.
 * Electronic: requires external reference + evidence note.
 */
export async function executeRefund(session: StaffSession, input: unknown): Promise<RefundResult> {
  const parsed = refundExecuteSchema.safeParse(input)
  if (!parsed.success) throw new PaymentError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { refundId, externalReference, evidenceNote, idempotencyKey: key } = parsed.data
  const observed = await prisma.refund.findUnique({ where: { id: BigInt(refundId) } })
  if (!observed) throw new PaymentError('طلب الاسترداد غير موجود', 404)
  if (!staffCanAccessBranch(session, observed.branchId)) throw new PaymentError('غير مصرح', 403)
  const electronic = observed.method !== 'cash'
  if (electronic) {
    if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new PaymentError('غير مصرح بتنفيذ الاسترداد الإلكتروني', 403)
  } else {
    if (session.role !== ROLE.OWNER && session.role !== ROLE.CASHIER) throw new PaymentError('غير مصرح بتنفيذ الاسترداد النقدي', 403)
  }
  if (electronic && (!externalReference?.trim() || !evidenceNote?.trim())) throw new PaymentError('مرجع الاسترداد الإلكتروني ودليل التنفيذ مطلوبان', 400)
  const fingerprint = createHash('sha256').update(JSON.stringify({ refundId, externalReference, evidenceNote })).digest('hex')
  const operationWhere = key ? { branchId_actorId_operationType_idempotencyKey: { branchId: observed.branchId, actorId: session.id, operationType: 'refund_execute', idempotencyKey: key } } : null
  const replay = (prior: { fingerprint: string; result: unknown } | null) => {
    if (!prior) return null
    if (prior.fingerprint !== fingerprint) throw new PaymentError('مفتاح العملية استُخدم لطلب مختلف', 409)
    return prior.result as RefundResult
  }
  // Durable replay precedes status/open-shift checks, including after close.
  if (operationWhere) {
    const prior = replay(await prisma.financialOperation.findUnique({ where: operationWhere }))
    if (prior) return prior
  }
  const observedShift = electronic ? null : await getOpenShift(session.id, observed.branchId)
  if (!electronic && !observedShift) throw new PaymentError('لا توجد وردية مفتوحة للاسترداد النقدي', 409)
  return prisma.$transaction(async (tx) => {
    // Same ordering as collection/close: executing shift FIRST, then payment,
    // then refund. Different drawers still serialize on the original payment.
    const lockedShift: LockedOpenShift | null = observedShift ? await lockAndReadShift(tx, observedShift.id) : null
    await lockRefundPayment(tx, observed.paymentId, observed.branchId)
    const refund = await lockRefund(tx, observed.id, observed.paymentId, observed.branchId)
    if (operationWhere) {
      const prior = replay(await tx.financialOperation.findUnique({ where: operationWhere }))
      if (prior) return prior
    }
    if (observedShift && (!lockedShift || lockedShift.status !== 'open' || lockedShift.cashierId !== session.id || lockedShift.branchId !== observed.branchId)) throw new PaymentError('الوردية مغلقة أو لا تخص الكاشير والفرع', 409)
    if (refund.method !== observed.method || refund.orderId !== observed.orderId) throw new PaymentError('تغير ربط الاسترداد', 409)
    if (refund.status !== 'APPROVED') throw new PaymentError('لا يمكن تنفيذ استرداد غير معتمد أو منفذ سابقًا', 409)
    const payment = await tx.payment.findUnique({ where: { id: refund.paymentId } })
    if (!payment || payment.status !== 'completed' || payment.branchId !== refund.branchId || payment.orderId !== refund.orderId || payment.method !== refund.method) throw new PaymentError('ربط الدفعة والاسترداد غير صالح', 409)
    if (!Number.isFinite(Number(refund.amount)) || Number(refund.amount) <= 0 || Math.abs(Number(refund.amount) * 100 - Math.round(Number(refund.amount) * 100)) > 0.000001) throw new PaymentError('مبلغ استرداد غير صالح', 409)
    if (Number(refund.amount) > await refundableBalance(tx, refund.paymentId)) throw new PaymentError('مبلغ الاسترداد يتجاوز الرصيد القابل للاسترداد', 409)
    let expectedBefore: number | null = null
    if (observedShift) {
      const shift = await tx.shift.findUnique({ where: { id: observedShift.id } })
      if (!shift) throw new PaymentError('الوردية غير موجودة', 409)
      expectedBefore = (await readShiftCashState(tx, shift)).expectedCash
      if (Number(refund.amount) > expectedBefore) throw new PaymentError('رصيد الصندوق غير كافٍ للاسترداد النقدي', 409)
    }
    // Existing unlinked evidence must never be silently duplicated.
    const existing = await tx.financialMovement.findFirst({ where: { branchId: refund.branchId, type: 'cash_refund', metadata: { path: ['refundId'], equals: refundId } }, select: { id: true } })
    if (existing) throw new PaymentError('يوجد أثر نقدي سابق يتطلب مراجعة موثقة', 409)
    const at = new Date()
    const changed = await tx.refund.updateMany({
      where: { id: refund.id, branchId: refund.branchId, paymentId: refund.paymentId, status: 'APPROVED' },
      data: { status: 'COMPLETED', executedById: session.id, executedAt: at,
        ...(electronic ? { externalReference: externalReference!.trim(), evidenceNote: evidenceNote!.trim() } : {}) },
    })
    if (changed.count !== 1) throw new PaymentError('تغيرت حالة الاسترداد', 409)
    const movement = observedShift ? await tx.financialMovement.create({ data: {
      branchId: refund.branchId, type: 'cash_refund', status: 'posted', amount: refund.amount,
      sourceAccount: 'CASHIER_TILL', destinationAccount: 'CUSTOMER', sourceShiftId: observedShift.id,
      actorId: session.id, occurredAt: at, reason: 'Executed cash refund',
      metadata: { refundId, paymentId: refund.paymentId.toString(), orderId: refund.orderId.toString(), executedBy: session.id, executedAt: at.toISOString() },
    } }) : null
    await tx.auditLog.create({ data: {
      userId: session.id, branchId: refund.branchId, action: 'refund.execute', entityType: 'refund', entityId: refund.id,
      oldValues: { status: refund.status },
      newValues: { refundId, method: refund.method, amount: refund.amount.toString(), executedBy: session.id, executedAt: at.toISOString(),
        executionShiftId: observedShift?.id.toString() ?? null, movementId: movement?.id.toString() ?? null,
        expectedCashBefore: expectedBefore?.toFixed(2) ?? null, expectedCashAfter: expectedBefore === null ? null : round2(expectedBefore - Number(refund.amount)).toFixed(2),
        externalReference: electronic ? externalReference!.trim() : null },
    } })
    const result: RefundResult = { refundId, orderId: refund.orderId.toString(), orderNumber: '', paymentId: refund.paymentId.toString(), amount: refund.amount.toString(), method: refund.method as PaymentMethod, status: 'COMPLETED' }
    if (operationWhere) await tx.financialOperation.create({ data: { branchId: refund.branchId, actorId: session.id, operationType: 'refund_execute', idempotencyKey: key!, fingerprint, result: result as unknown as Prisma.InputJsonValue } })
    return result
  })
}

/** Cancel a refund — requester or manager+, REQUESTED/APPROVED only. */
export async function cancelRefund(
  session: StaffSession,
  input: unknown,
): Promise<RefundResult> {
  const parsed = refundCancelSchema.safeParse(input)
  if (!parsed.success) throw new PaymentError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { refundId, reason } = parsed.data

  const refund = await prisma.refund.findUnique({ where: { id: BigInt(refundId) }, select: { id: true, branchId: true, status: true, requestedById: true, amount: true, method: true, paymentId: true, orderId: true } })
  if (!refund) throw new PaymentError('طلب الاسترداد غير موجود', 404)
  if (!staffCanAccessBranch(session, refund.branchId)) throw new PaymentError('غير مصرح', 403)
  if (!['REQUESTED', 'APPROVED'].includes(refund.status)) throw new PaymentError('لا يمكن إلغاء استرداد في هذه الحالة', 409)
  if (refund.requestedById !== session.id && !hasAtLeast(session.role, ROLE.MANAGER)) throw new PaymentError('لا يمكن إلغاء استرداد طلب شخص آخر', 403)

  const order = await prisma.order.findUnique({ where: { id: refund.orderId }, select: { orderNumber: true } })

  return prisma.$transaction(async (tx) => {
    await lockRefundPayment(tx, refund.paymentId, refund.branchId)
    const current = await lockRefund(tx, refund.id, refund.paymentId, refund.branchId)
    if (!current || !['REQUESTED', 'APPROVED'].includes(current.status)) throw new PaymentError('تغيرت حالة طلب الاسترداد؛ حدّث الصفحة', 409)
    if (current.requestedById !== session.id && !hasAtLeast(session.role, ROLE.MANAGER)) throw new PaymentError('لا يمكن إلغاء استرداد طلب شخص آخر', 403)

    const changed = await tx.refund.updateMany({
      where: { id: current.id, branchId: refund.branchId, status: current.status },
      data: { status: 'CANCELLED' },
    })
    if (changed.count !== 1) throw new PaymentError('تغيرت حالة الاسترداد', 409)
    const updated = { ...current, status: 'CANCELLED' }

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: refund.branchId,
        action: 'refund.cancel',
        entityType: 'refund',
        entityId: refund.id,
        newValues: {
          refundId: refund.id.toString(),
          reason: reason?.trim() || null,
          cancelledBy: session.id,
        },
      },
    })

    return {
      refundId: updated.id.toString(),
      orderId: refund.orderId.toString(),
      orderNumber: order?.orderNumber ?? '',
      paymentId: refund.paymentId.toString(),
      amount: updated.amount.toString(),
      method: updated.method as PaymentMethod,
      status: updated.status,
    }
  })
}

/** List refunds with filters. Owner sees all branches; others own branch. */
export async function getRefunds(
  session: StaffSession,
  filters: { from?: string; to?: string; branchId?: string; status?: string } = {},
): Promise<RefundResult[]> {
  const branchScope = session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }
  const where: Prisma.RefundWhereInput = { ...branchScope }
  if (filters.branchId && /^\d+$/.test(filters.branchId)) where.branchId = BigInt(filters.branchId)
  if (filters.status && isRefundStatus(filters.status)) where.status = filters.status
  if (filters.from || filters.to) {
    where.createdAt = {}
    if (filters.from) where.createdAt.gte = new Date(`${filters.from}T00:00:00.000Z`)
    if (filters.to) where.createdAt.lte = new Date(`${filters.to}T23:59:59.999Z`)
  }

  const rows = await prisma.refund.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, orderId: true, paymentId: true, amount: true, method: true, status: true },
  })

  const orderNumbers = await prisma.order.findMany({
    where: { id: { in: rows.map((r) => r.orderId) } },
    select: { id: true, orderNumber: true },
  })
  const orderNumberMap = new Map(orderNumbers.map((o) => [o.id.toString(), o.orderNumber]))

  return rows.map((r) => ({
    refundId: r.id.toString(),
    orderId: r.orderId.toString(),
    orderNumber: orderNumberMap.get(r.orderId.toString()) ?? '',
    paymentId: r.paymentId.toString(),
    amount: r.amount.toString(),
    method: r.method as PaymentMethod,
    status: r.status,
  }))
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
