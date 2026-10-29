import { z } from 'zod'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { notifyRole } from '@/lib/notifications'
import { getOpenShift } from '@/lib/staff-shifts'
import { lockAndReadShift } from '@/lib/financial-shift-lock'

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
export const PAYMENT_METHODS = ['cash', 'mobile_wallet', 'instapay', 'card', 'online'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  mobile_wallet: 'محفظة إلكترونية',
  instapay: 'إنستا باي',
  card: 'بطاقة',
  online: 'أونلاين',
}

/** Input contract shared by the payment API and regression tests. */
export const paymentCollectionSchema = z.object({
  method: z.enum(PAYMENT_METHODS, {
    errorMap: () => ({ message: 'طريقة الدفع غير صالحة' }),
  }),
  // Cash only: tendered amount (>= outstanding). Non-cash methods settle the
  // server-calculated outstanding balance after an explicit cashier attestation.
  received: z.coerce.number().positive('المبلغ المستلم يجب أن يكون أكبر من صفر').max(9_999_999).optional(),
  electronicPaymentConfirmed: z.boolean().optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).superRefine((value, context) => {
  if (value.method === 'cash' && value.received === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['received'], message: 'المبلغ المستلم مطلوب للدفع النقدي' })
  }
  if (value.method !== 'cash' && value.electronicPaymentConfirmed !== true) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['electronicPaymentConfirmed'], message: 'يجب تأكيد استلام الدفع الإلكتروني' })
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
  if (!hasAtLeast(session.role, ROLE.CASHIER)) throw new PaymentError('غير مصرح', 403)
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

export interface RefundResult {
  orderId: string
  orderNumber: string
  refunded: number
  paymentStatus: 'refunded'
}

/**
 * Refund a paid order — manager+ only (money reversal is a privileged action).
 * Completed payments are marked 'refunded'; order.paymentStatus becomes
 * 'refunded'. Nothing is deleted: the money trail stays auditable.
 */
export async function refundOrderPayment(
  session: StaffSession,
  orderIdRaw: string,
  input: unknown,
): Promise<RefundResult> {
  // P0 safety gate: the deployed schema has no immutable, payment-linked refund
  // ledger. The legacy implementation below mutates completed Payment rows and
  // can rewrite a closed shift's reconciliation. Do not re-enable until the
  // additive payment_refunds migration and its transactional writer land.
  void session
  void orderIdRaw
  void input
  throw new PaymentError('الاسترداد متوقف مؤقتاً حتى تفعيل سجل الاستردادات غير القابل للتعديل', 503)

  /*
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new PaymentError('غير مصرح', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new PaymentError('الطلب غير موجود', 404)

  const parsed = refundSchema.safeParse(input)
  if (!parsed.success) throw new PaymentError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderIdRaw) },
    select: { id: true, branchId: true, orderNumber: true, paymentStatus: true },
  })
  if (!order) throw new PaymentError('الطلب غير موجود', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new PaymentError('غير مصرح', 403)
  if (order.paymentStatus !== 'paid') throw new PaymentError('الطلب غير مدفوع — لا يوجد ما يُسترد', 409)

  const refundKey = parsed.data.idempotencyKey
  const refundFingerprint = createHash('sha256').update(JSON.stringify({ orderId: orderIdRaw, reason: parsed.data.reason })).digest('hex')
  if (refundKey) {
    const prior = await prisma.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType: 'payment_refund', idempotencyKey: refundKey } } })
    if (prior) { if (prior.fingerprint !== refundFingerprint) throw new PaymentError('Idempotency key was reused with a different request', 409); return prior.result as unknown as RefundResult }
  }

  // Required operational shifts remain enforced. Manager/Owner refunds stay
  // auditable without inventing a shift that does not exist.
  const openShift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, order.branchId) : null
  if (requiresOperationalShift(session.role) && !openShift) {
    throw new PaymentError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)
  }

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ payment_status: string }[]>`
      SELECT payment_status FROM orders WHERE id = ${order.id} FOR UPDATE
    `
    if (locked[0]?.payment_status !== 'paid') throw new PaymentError('الطلب غير مدفوع — لا يوجد ما يُسترد', 409)

    const updated = await tx.payment.updateMany({
      where: { orderId: order.id, status: 'completed' },
      data: { status: 'refunded' },
    })
    if (updated.count === 0) throw new PaymentError('لا توجد دفعات مكتملة للاسترداد', 409)

    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'refunded' } })

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: order.branchId,
        action: 'payment.refund',
        entityType: 'order',
        entityId: order.id,
        newValues: {
          refundedPayments: updated.count,
          reason: parsed.data.reason,
          shiftId: openShift?.id.toString() ?? null,
        },
      },
    })

    const result = {
      orderId: order.id.toString(),
      orderNumber: order.orderNumber,
      refunded: updated.count,
      paymentStatus: 'refunded' as const,
    }
    if (refundKey) await tx.financialOperation.create({ data: { branchId: order.branchId, actorId: session.id, operationType: 'payment_refund', idempotencyKey: refundKey, fingerprint: refundFingerprint, result } })
    return result
  }) */
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
