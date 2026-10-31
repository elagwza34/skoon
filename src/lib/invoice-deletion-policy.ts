import { ROLE } from '@/lib/authz'

type InvoiceDeletionActor = { role: string } | null

export type InvoiceDeletionRejection = {
  status: 401 | 403 | 405
  error: string
  allow?: string
}

/**
 * Permanent invoice deletion is intentionally unavailable at runtime.
 *
 * Authentication and role checks remain explicit so callers receive the same
 * security boundary without any order/payment lookup or destructive write.
 */
export function invoiceDeletionRejection(actor: InvoiceDeletionActor): InvoiceDeletionRejection {
  if (!actor) return { status: 401, error: 'Not authenticated' }
  if (actor.role !== ROLE.OWNER) return { status: 403, error: 'غير مصرح — إدارة السجلات المالية للمالك فقط' }
  return {
    status: 405,
    error: 'الحذف الدائم للفواتير غير متاح حفاظًا على السجلات المالية. استخدم إجراءات الإلغاء أو الاسترداد المعتمدة.',
    allow: 'PATCH',
  }
}
