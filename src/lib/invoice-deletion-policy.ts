import { ROLE } from '@/lib/authz'

type InvoiceDeletionActor = {
  role: string
  isCancelled?: boolean
  hasCompletedPayments?: boolean
  hasInventoryActivity?: boolean
  hasAuditHistory?: boolean
} | null

export type InvoiceDeletionRejection = {
  status: 200 | 401 | 403 | 405 | 409
  error: string | null
  allow?: string
}

/**
 * Financial record protection policy for invoice archival/deletion.
 *
 * No financially material record may be destructively removed. This policy
 * governs soft-archival (isArchived = true) only — it never permits hard
 * deletion of orders, payments, refunds, inventory movements, or audit events.
 *
 * Rules:
 * - Unauthenticated -> 401
 * - Non-owner -> 403 (Owner privileges do not imply permission to erase accounting history)
 * - Invoice with completed payments -> 409 (protected financial history)
 * - Invoice with inventory activity -> 409 (protected operational history)
 * - Invoice with audit history -> 409 (protected audit trail)
 * - Non-cancelled invoice -> 405 (use cancellation/refund/reversal instead)
 * - Cancelled invoice with no financial/operational/audit activity -> 200 (soft archive allowed)
 */
export function invoiceDeletionPolicy(actor: InvoiceDeletionActor): InvoiceDeletionRejection {
  if (!actor) return { status: 401, error: 'غير مصرح — يتطلب تسجيل دخول', allow: undefined }
  if (actor.role !== ROLE.OWNER) return { status: 403, error: 'غير مصرح — إدارة السجلات المالية للمالك فقط', allow: undefined }

  // Financially material records are never removable, even by Owner.
  if (actor.hasCompletedPayments) {
    return {
      status: 409,
      error: 'لا يمكن أرشفة فاتورة بها مدفوعات مكتملة — السجلات المالية محمية.',
      allow: undefined,
    }
  }
  if (actor.hasInventoryActivity) {
    return {
      status: 409,
      error: 'لا يمكن أرشفة فاتورة بها نشاط مخزون — السجلات التشغيلية محمية.',
      allow: undefined,
    }
  }
  if (actor.hasAuditHistory) {
    return {
      status: 409,
      error: 'لا يمكن أرشفة فاتورة بها سجل تدقيق — الأثر التداول محمي.',
      allow: undefined,
    }
  }

  if (!actor.isCancelled) {
    return {
      status: 405,
      error: 'لا يمكن أرشفة فاتورة غير ملغاة. استخدم الإلغاء أو الاسترداد المعتمد.',
      allow: 'PATCH',
    }
  }

  return { status: 200, error: null, allow: 'DELETE' }
}
