import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'

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

export const PAYMENT_METHODS = ['cash', 'card', 'online'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  card: 'بطاقة',
  online: 'أونلاين',
}

const paySchema = z.object({
  method: z.enum(['cash', 'card', 'online'], {
    errorMap: () => ({ message: 'طريقة الدفع غير صالحة' }),
  }),
  // Cash only: tendered amount (>= outstanding). Optional for card/online.
  received: z.coerce.number().positive('المبلغ المستلم يجب أن يكون أكبر من صفر').max(9_999_999).optional(),
})

const refundSchema = z.object({
  reason: z.string().trim().min(3, 'سبب الاسترداد مطلوب (3 أحرف على الأقل)').max(255),
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

  const parsed = paySchema.safeParse(input)
  if (!parsed.success) throw new PaymentError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { method } = parsed.data

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderIdRaw) },
    select: { id: true, branchId: true, orderNumber: true, status: true },
  })
  if (!order) throw new PaymentError('الطلب غير موجود', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new PaymentError('غير مصرح', 403)
  if (order.status === 'cancelled') throw new PaymentError('لا يمكن تحصيل طلب ملغي', 409)

  return prisma.$transaction(async (tx) => {
    // Lock the order row for the duration of the transaction.
    const locked = await tx.$queryRaw<{ total: unknown }[]>`
      SELECT total FROM orders WHERE id = ${order.id} FOR UPDATE
    `
    const total = Number(locked[0]?.total ?? 0)

    const paidAgg = await tx.payment.aggregate({
      where: { orderId: order.id, status: 'completed' },
      _sum: { amount: true },
    })
    const paid = Number(paidAgg._sum.amount ?? 0)
    const outstanding = round2(total - paid)
    if (outstanding <= 0) throw new PaymentError('الطلب مدفوع بالفعل', 409)

    let received = outstanding
    if (method === 'cash' && parsed.data.received !== undefined) {
      received = parsed.data.received
      if (received < outstanding) throw new PaymentError('المبلغ المستلم أقل من المطلوب', 400)
    }
    const change = round2(received - outstanding)

    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        branchId: order.branchId,
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

    return {
      orderId: order.id.toString(),
      orderNumber: order.orderNumber,
      paymentId: payment.id.toString(),
      method,
      amount: outstanding.toFixed(2),
      changeAmount: change.toFixed(2),
      paymentStatus: 'paid',
    }
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
        newValues: { refundedPayments: updated.count, reason: parsed.data.reason },
      },
    })

    return {
      orderId: order.id.toString(),
      orderNumber: order.orderNumber,
      refunded: updated.count,
      paymentStatus: 'refunded' as const,
    }
  })
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
