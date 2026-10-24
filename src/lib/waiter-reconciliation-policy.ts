/**
 * Pure policy for the legacy waiter-responsibility review.  These helpers are
 * deliberately side-effect free: a review proposal is not an assignment and
 * may never update an order by itself.
 */
export const RECONCILIATION_DECISIONS = [
  'assign_waiter',
  'keep_unassigned',
  'review_later',
  'resolve_through_existing_workflow',
] as const

export const RECONCILIATION_REVIEW_STATUSES = [
  'pending_review',
  'proposed',
  'approved',
  'rejected',
  'needs_more_info',
] as const

export type ReconciliationDecision = (typeof RECONCILIATION_DECISIONS)[number]
export type ReconciliationReviewStatus = (typeof RECONCILIATION_REVIEW_STATUSES)[number]

export type LegacyOrderSnapshot = {
  branchId: string
  status: string
  paymentStatus: string
  source: string
  responsibleWaiterId: string | null
  updatedAt: string
}

export type EligibleWaiter = {
  id: string
  branchId: string
  role: string
  isActive: boolean
  hasOpenShift: boolean
}

export type ProposalInput = {
  order: LegacyOrderSnapshot
  decision: ReconciliationDecision
  reason: string
  proposedWaiterId?: string | null
  eligibleWaiters: EligibleWaiter[]
}

export type ProposalValidation = { ok: true } | { ok: false; error: string }

export function canReviewLegacyResponsibility(role: string): boolean {
  return role === 'owner' || role === 'manager'
}

export function isHistoricalLegacyOrder(order: Pick<LegacyOrderSnapshot, 'status' | 'paymentStatus'>): boolean {
  const status = order.status.toLowerCase()
  return order.paymentStatus.toLowerCase() === 'paid' || status === 'cancelled' || status === 'completed'
}

export function validateLegacyReconciliationProposal(input: ProposalInput): ProposalValidation {
  if (isHistoricalLegacyOrder(input.order)) {
    return { ok: false, error: 'لا يمكن إنشاء اقتراح تسوية لطلب تاريخي أو مسدد.' }
  }
  if (input.order.responsibleWaiterId !== null) {
    return { ok: false, error: 'تغيرت مسؤولية الطلب؛ أعد تحميل بيانات المراجعة قبل المتابعة.' }
  }
  if (input.reason.trim().length < 3 || input.reason.trim().length > 500) {
    return { ok: false, error: 'سبب القرار مطلوب ويجب أن يكون بين 3 و500 حرف.' }
  }

  if (input.decision !== 'assign_waiter') {
    if (input.proposedWaiterId) return { ok: false, error: 'لا يختار هذا القرار ويترًا مقترحًا.' }
    return { ok: true }
  }

  if (!input.proposedWaiterId) return { ok: false, error: 'اختر ويترًا مؤهلًا للفرع.' }
  const waiter = input.eligibleWaiters.find((candidate) => candidate.id === input.proposedWaiterId)
  if (!waiter || waiter.branchId !== input.order.branchId || waiter.role !== 'waiter' || !waiter.isActive || !waiter.hasOpenShift) {
    return { ok: false, error: 'الويتر المختار غير مؤهل أو لا يملك وردية مفتوحة في الفرع.' }
  }
  return { ok: true }
}

/** A proposal must be invalidated if the persisted order changes before approval. */
export function isLegacySnapshotCurrent(snapshot: LegacyOrderSnapshot, current: LegacyOrderSnapshot): boolean {
  return snapshot.branchId === current.branchId
    && snapshot.status === current.status
    && snapshot.paymentStatus === current.paymentStatus
    && snapshot.source === current.source
    && snapshot.responsibleWaiterId === current.responsibleWaiterId
    && snapshot.updatedAt === current.updatedAt
}

export function canTransitionReconciliationReview(
  from: ReconciliationReviewStatus,
  to: ReconciliationReviewStatus,
): boolean {
  const allowed: Record<ReconciliationReviewStatus, ReconciliationReviewStatus[]> = {
    pending_review: ['proposed', 'rejected', 'needs_more_info'],
    proposed: ['approved', 'rejected', 'needs_more_info'],
    approved: [],
    rejected: [],
    needs_more_info: ['proposed', 'rejected'],
  }
  return allowed[from].includes(to)
}

/** Approval records a decision only. Execution must be a separate audited transaction. */
export function approvalExecutesOrderMutation(): false {
  return false
}
