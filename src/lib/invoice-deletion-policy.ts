import { ROLE } from '@/lib/authz'

type InvoiceDeletionActor = { role: string; isCancelled?: boolean } | null

export type InvoiceDeletionRejection = {
  status: 200 | 401 | 403 | 405
  error: string | null
  allow?: string
}

/**
 * Permanent invoice deletion.
 *
 * - Unauthenticated -> 401
 * - Non-owner -> 403
 * - Owner deleting a cancelled invoice -> allowed (200 + Allow: DELETE)
 * - Owner deleting a non-cancelled invoice -> 405 (use cancellation/refund instead)
 */
export function invoiceDeletionPolicy(actor: InvoiceDeletionActor): InvoiceDeletionRejection {
  if (!actor) return { status: 401, error: 'Not authenticated', allow: undefined }
  if (actor.role !== ROLE.OWNER) return { status: 403, error: 'غير مصرح — إدارة السجلات المالية للمالك فقط', allow: undefined }
  if (actor.isCancelled) return { status: 200, error: null, allow: 'DELETE' }
  return {
    status: 405,
    error: 'لا يمكن حذف فاتورة غير ملغاة نهائيًا. استخدم الإلغاء أو الاسترداد المعتمد.',
    allow: 'PATCH',
  }
}
