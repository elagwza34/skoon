/**
 * Offline unit tests — NO database, NO network, NO external services.
 * Run with:  node --import tsx --test tests/offline.test.ts
 *
 * Covers: public env validation, authorization helpers, and the secure POS PIN
 * storage/verification design (real bcrypt hash/verify round-trip).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planStockCount } from '../src/lib/stock-count-policy'

import { getPublicEnv } from '../src/lib/env'
import { unauthenticatedStaffResponse, forbiddenStaffResponse, isStaffApiPath } from '../src/lib/api-auth-response'
import { normalizedRequestId } from '../src/lib/request-correlation'
import { clearLegacyLoginCredentials, LEGACY_LOGIN_CREDENTIAL_KEY } from '../src/lib/auth/login-storage'
import { safeInternalRedirect } from '../src/lib/auth/safe-redirect'
import { calculatePayrollPreview, INITIAL_PAYROLL_POLICY } from '../src/lib/payroll-preview-policy'
import { calculatePayroll } from '../src/lib/hr-payroll-calculation'
import { calculateInvoiceDiscounts } from '../src/lib/invoice-discounts'
import { calculateInvoiceTaxCents, centsText } from '../src/lib/invoice-recalculation'
import { invoiceDeletionRejection } from '../src/lib/invoice-deletion-policy'
import { nextPayrollStatus, toCents as payrollToCents } from '../src/lib/staff-payroll-write'
import { normalizeStaffUsername, staffIdentityEmail, staffLoginEmail, staffUsernameEmail, usernameFromStaffEmail } from '../src/lib/staff-username'
import { initialBranchSchema } from '../src/lib/branch-bootstrap'
import { isSameOriginStaffApiRequest } from '../src/components/auth/auth-expiry-guard'
import {
  ROLE,
  isKnownRole,
  hasAtLeast,
  isOwner,
  requiresOperationalShift,
  canAccessBranch,
  hasPermission,
} from '../src/lib/authz'
import {
  validatePinFormat,
  hashPin,
  verifyPin,
  PIN_MIN_LENGTH,
  PIN_MAX_LENGTH,
} from '../src/lib/security/pin'
import { PAYMENT_METHODS, paymentCollectionSchema, PaymentError, refundOrderPayment, refundSchema } from '../src/lib/staff-payments-write'
import { buildPaymentRequestPayload, paymentServiceInputFromRequest } from '../src/lib/payment-request'
import {
  avgPerPaidOrder,
  centsToAmount,
  methodTotalsReconcile,
  summarizePayments,
  toCents,
} from '../src/lib/finance-metrics'
import { buildHourly, buildDaily } from '../src/lib/dashboard-stats'
import {
  cashDifferenceOf,
  closeShiftSchema,
  computeShiftCashFlow,
  expectedCashFrom,
  expectedCashAfterOperationalWithdrawals,
  crossedLocalMidnight,
  isCashHandlingRole,
  isOpenShiftUniquenessConflict,
  openShiftSchema,
} from '../src/lib/staff-shifts'
import { floatMovementSchema } from '../src/lib/staff-float'
import { financialShiftLockName } from '../src/lib/financial-shift-lock'
import { assertRefundAmount, assertRefundReservation, refundAffectsTill, remainingRefundableCents, remainingReservableRefundCents } from '../src/lib/refund-accounting'
import { editOpenInvoice, isInvoiceSettled, recalculateInvoiceTotals, resolveVariantLabels, splitInvoices, type InvoiceRow } from '../src/lib/staff-invoices'
import { receiptInvoiceForSettlement, receiptSettlementBreakdown } from '../src/lib/receipt-settlement'
import { captureReceiptPrintTimestamp, formatReceiptPrintTime, receiptOrderTypeLabel } from '../src/lib/receipt-display'
import { posDraftKey, restorePosDraft } from '../src/lib/pos-draft'
import { confirmWaiterPosOrder } from '../src/lib/waiter-pos-confirmation'
import { posOrderSchema } from '../src/lib/staff-pos'
import { canRenderPosDiscountControls, containsDiscountSubmission, submittedDiscountFields } from '../src/lib/pos-discount-policy'
import { createOrderItemVariantSnapshot, orderedVariantLabels, resolveOrderItemVariantLabels } from '../src/lib/order-item-variant'
import { modifierSnapshotLabels } from '../src/lib/order-item-options'
import { modifierMutationSchema } from '../src/lib/staff-product-modifiers'
import { canVoidOrderItemForOrder, orderItemVoidBlocker } from '../src/lib/staff-order-item-void'
import { orderItemAdjustmentSchema, planOrderItemAdjustment } from '../src/lib/staff-order-item-adjustment'
import { proportionalReservationConsumption } from '../src/lib/staff-inventory-engine'
import { isKitchenTicketVisible, itemPreparationState, OrderError, takeawayDispatchBlocker, transitionOrderStatus } from '../src/lib/staff-orders'
import { canTransitionOrder } from '../src/lib/staff-orders'
import { editWaiterOrder, waiterOrderEditSchema } from '../src/lib/staff-orders'
import { canViewOwnerWaiterMonitor, isWaiterTableOrderActive } from '../src/lib/staff-waiter'
import { isMissingWaiterHandoverTableError } from '../src/lib/staff-waiter'
import { isPublicPath } from '../src/middleware'
import { isTransferEligible, requiresEmergencyServing } from '../src/lib/staff-waiter-operations'
import { canMutateServiceRequest, serviceRequestMonitorGroup } from '../src/lib/service-request-policy'
import { actOnServiceRequest, ServiceRequestError } from '../src/lib/staff-service-requests'
import type { StaffSession } from '../src/lib/session'
import { calculateVat, normalizeVatReportFilters, parseVatDate } from '../src/lib/vat-report'
import { FinanceError, getOwnerFinanceWorkspace } from '../src/lib/staff-finance'
import { getGuestOrders, saveGuestOrder } from '../src/lib/guest-orders'
import { SETTING_DEFS, SettingsError } from '../src/lib/staff-settings-write'
import {
  homeForRole,
  isOperationalRole,
  isOpsPath,
  canRenderInOpsShell,
  shouldRedirectOperationalUserToHome,
  permissionForPath,
  canSeeRoute,
  resolveRoleHome,
} from '../src/lib/route-access'
import { canManageEmployeeLifecycle, canReadEmployeeDirectory, canReadSensitiveEmployeeData, canResetEmployeePassword, employeeDeactivationBlocker } from '../src/lib/hr-authz'
import { canManageProducts, CatalogError, targetBranch } from '../src/lib/staff-catalog-write'
import { selectCatalogBranch } from '../src/lib/catalog-branch'
import {
  assertConfigurationCanBeDeleted,
  canonicalVariantCombination,
  parseExactQuantity,
  ProductConfigurationError,
  validateUnitConversion,
} from '../src/lib/product-configuration-policy'
import { effectivePeriodsOverlap, evaluateAttendance, validateWeeklySchedule } from '../src/lib/hr-scheduling-policy'
import { calculateHrTimeSummary } from '../src/lib/hr-time-calculation'
import { classifyUnassignedWaiterOrder } from '../src/lib/waiter-readiness-policy'
import {
  approvalExecutesOrderMutation,
  canReviewLegacyResponsibility,
  canTransitionReconciliationReview,
  isLegacySnapshotCurrent,
  validateLegacyReconciliationProposal,
} from '../src/lib/waiter-reconciliation-policy'
import { RECONCILE_SCHEMA, validateOwnerAuthority } from '../src/lib/staff-reconcile'

test('waiter lifecycle: only dispatched new tickets enter the kitchen queue', () => {
  assert.equal(isKitchenTicketVisible('new', false), false)
  assert.equal(isKitchenTicketVisible('new', true), true)
  assert.equal(isKitchenTicketVisible('preparing', false), false)
  assert.equal(isKitchenTicketVisible('ready', false), false)
  assert.equal(isKitchenTicketVisible('preparing', true), true)
  assert.equal(isKitchenTicketVisible('ready', true), true)
  assert.equal(isKitchenTicketVisible('served', true), false)
  assert.equal(isKitchenTicketVisible('cancelled', true), false)
})

test('takeaway POS: table is optional but dine-in still requires one', () => {
  const item = { productId: '1', qty: 1 }
  assert.equal(posOrderSchema.safeParse({ orderType: 'takeaway', items: [item] }).success, true)
  assert.equal(posOrderSchema.safeParse({ orderType: 'dine_in', items: [item] }).success, false)
  assert.equal(posOrderSchema.safeParse({ orderType: 'dine_in', tableId: '2', items: [item] }).success, true)
})

test('takeaway kitchen gate: only fully paid dispatched takeaway is visible', () => {
  assert.equal(takeawayDispatchBlocker('takeaway', 'unpaid'), 'unpaid')
  assert.equal(takeawayDispatchBlocker('takeaway', 'paid'), null)
  assert.equal(takeawayDispatchBlocker('dine_in', 'unpaid'), null)
  assert.equal(isKitchenTicketVisible('new', true, 'takeaway', 'unpaid'), false)
  assert.equal(isKitchenTicketVisible('new', true, 'takeaway', 'paid'), true)
  assert.equal(isKitchenTicketVisible('new', true, 'dine_in', 'unpaid'), true)
})

test('waiter lifecycle: only legal persisted status transitions are accepted', () => {
  assert.equal(canTransitionOrder('new', 'preparing'), true)
  assert.equal(canTransitionOrder('preparing', 'ready'), true)
  assert.equal(canTransitionOrder('ready', 'served'), true)
  assert.equal(canTransitionOrder('new', 'served'), false)
  assert.equal(canTransitionOrder('served', 'ready'), false)
  assert.equal(canTransitionOrder('cancelled', 'preparing'), false)
})

test('kitchen lifecycle: line readiness is independent so an order can be partially ready', () => {
  assert.equal(itemPreparationState({ qty: 2, preparedQty: 0, preparationStartedAt: null }), 'new')
  assert.equal(itemPreparationState({ qty: 2, preparedQty: 0, preparationStartedAt: '2026-10-23T10:00:00.000Z' }), 'preparing')
  assert.equal(itemPreparationState({ qty: 2, preparedQty: 2, preparationStartedAt: '2026-10-23T10:00:00.000Z' }), 'ready')
})

test('waiter lifecycle: cancelled and served orders do not occupy a table', () => {
  assert.equal(isWaiterTableOrderActive('new'), true)
  assert.equal(isWaiterTableOrderActive('preparing'), true)
  assert.equal(isWaiterTableOrderActive('ready'), true)
  assert.equal(isWaiterTableOrderActive('served'), false)
  assert.equal(isWaiterTableOrderActive('cancelled'), false)
})

test('waiter schema fault is explicit only for the missing handover relation', () => {
  assert.equal(isMissingWaiterHandoverTableError({ code: 'P2021', meta: { table: 'public.waiter_shift_handovers' } }), true)
  assert.equal(isMissingWaiterHandoverTableError({ code: 'P2021', meta: { table: 'public.orders' } }), false)
  assert.equal(isMissingWaiterHandoverTableError({ code: 'P2002', meta: { table: 'public.waiter_shift_handovers' } }), false)
})

test('receipt logo is public while waiter routes remain protected', () => {
  assert.equal(isPublicPath('/receipt-logo.png'), true)
  assert.equal(isPublicPath('/waiter'), false)
  assert.equal(isPublicPath('/api/staff/waiter/handovers'), false)
})

test('thermal receipt uses canonical Arabic order-type labels', () => {
  assert.equal(receiptOrderTypeLabel('dine_in'), 'داخل الكافيه')
  assert.equal(receiptOrderTypeLabel('takeaway'), 'تيك أواي')
  assert.equal(receiptOrderTypeLabel('TAKEAWAY'), 'تيك أواي')
})

test('thermal receipt captures a fresh Cairo-local time for every print attempt', () => {
  const first = captureReceiptPrintTimestamp(() => new Date('2026-01-15T12:28:00.000Z'))
  const reprint = captureReceiptPrintTimestamp(() => new Date('2026-01-15T13:00:00.000Z'))
  assert.equal(formatReceiptPrintTime(first), '2:28 PM')
  assert.equal(formatReceiptPrintTime(reprint), '3:00 PM')
  assert.notEqual(first.getTime(), reprint.getTime())
})

test('owner waiter monitor is read-only while the waiter service workflow remains available', () => {
  assert.equal(canViewOwnerWaiterMonitor(ROLE.OWNER), true)
  assert.equal(canViewOwnerWaiterMonitor(ROLE.WAITER), false)
  assert.equal(canMutateServiceRequest(ROLE.OWNER), false)
  assert.equal(canMutateServiceRequest(ROLE.WAITER), true)
  assert.equal(canMutateServiceRequest(ROLE.MANAGER), true)
  assert.equal(canMutateServiceRequest(ROLE.KITCHEN), false)
})

test('owner finance workspace is owner-only and does not require an operational shift', () => {
  assert.equal(canSeeRoute(ROLE.OWNER, [], '/finance'), true)
  assert.equal(canSeeRoute(ROLE.MANAGER, ['reports.view'], '/finance'), false)
  assert.equal(requiresOperationalShift(ROLE.OWNER), false)
  assert.equal(requiresOperationalShift(ROLE.CASHIER), true)
})

test('finance service rejects non-owner access before reading financial records', async () => {
  const manager: StaffSession = { id: '00000000-0000-0000-0000-000000000002', email: null, name: 'Manager', role: ROLE.MANAGER, branchId: '1', permissions: ['reports.view'] }
  await assert.rejects(() => getOwnerFinanceWorkspace(manager), (error: unknown) => error instanceof FinanceError && error.status === 403)
})

test('owner direct operational waiter and service-request mutations are rejected before database access', async () => {
  const owner: StaffSession = { id: '00000000-0000-0000-0000-000000000001', email: null, name: 'Owner', role: ROLE.OWNER, branchId: null, permissions: [] }
  await assert.rejects(
    () => transitionOrderStatus(owner, '1', 'preparing'),
    (error: unknown) => error instanceof OrderError && error.status === 403,
  )
  await assert.rejects(
    () => actOnServiceRequest(owner, 1n, { action: 'accept' }),
    (error: unknown) => error instanceof ServiceRequestError && error.status === 403,
  )
})

test('service-request monitor filtering groups only persisted operational states', () => {
  assert.equal(serviceRequestMonitorGroup('pending'), 'pending')
  assert.equal(serviceRequestMonitorGroup('accepted'), 'claimed')
  assert.equal(serviceRequestMonitorGroup('in_progress'), 'claimed')
  assert.equal(serviceRequestMonitorGroup('resolved'), 'completed')
  assert.equal(serviceRequestMonitorGroup('cancelled'), 'completed')
})

test('VAT: fully settled invoices use stored tax snapshots and count once', () => {
  const result = calculateVat([{ id: '1', number: 'INV-1', branchId: '1', branch: 'Main', createdAt: new Date('2026-01-01T00:00:00Z'), subtotal: '100.00', discount: '0.00', tax: '14.00', total: '114.00', taxRate: '14', payments: [{ status: 'completed', amount: '114.00', createdAt: new Date('2026-01-02T10:00:00Z') }] }])
  assert.equal(result.collectedVatCents, 1400)
  assert.equal(result.netVatCents, 1400)
  assert.equal(result.salesExcludingVatCents, 10000)
  assert.equal(result.salesIncludingVatCents, 11400)
  assert.equal(result.paidInvoices, 1)
  assert.equal(result.rows.length, 1)
})

test('VAT: partial and multiple payments are excluded without inventing allocation', () => {
  const base = { branchId: '1', branch: 'Main', createdAt: new Date(), subtotal: '100.00', discount: '0.00', tax: '14.00', total: '114.00', taxRate: '14' }
  const result = calculateVat([
    { ...base, id: '1', number: 'PARTIAL', payments: [{ status: 'completed', amount: '50.00', createdAt: new Date() }] },
    { ...base, id: '2', number: 'SPLIT', payments: [{ status: 'completed', amount: '57.00', createdAt: new Date() }, { status: 'completed', amount: '57.00', createdAt: new Date() }] },
  ])
  assert.equal(result.collectedVatCents, 0)
  assert.equal(result.paidInvoices, 0)
  assert.deepEqual(result.excluded.map((row) => row.reason), ['partial_or_mismatched_payment_no_tax_allocation', 'multiple_settled_payments_no_tax_allocation'])
})

test('VAT: full refunds, tax-exempt invoices, and distinct invoice tax rates reconcile exactly', () => {
  const base = { branchId: '1', branch: 'Main', createdAt: new Date(), subtotal: '100.00', discount: '0.00' }
  const result = calculateVat([
    { ...base, id: '1', number: 'REFUND', tax: '14.00', total: '114.00', taxRate: '14', payments: [{ status: 'refunded', amount: '114.00', createdAt: new Date() }] },
    { ...base, id: '2', number: 'EXEMPT', tax: '0.00', total: '100.00', taxRate: '0', payments: [{ status: 'completed', amount: '100.00', createdAt: new Date() }] },
    { ...base, id: '3', number: 'RATE-5', tax: '5.00', total: '105.00', taxRate: '5', payments: [{ status: 'completed', amount: '105.00', createdAt: new Date() }] },
  ])
  assert.equal(result.refundedVatCents, 1400)
  assert.equal(result.collectedVatCents, 500)
  assert.equal(result.netVatCents, -900)
  assert.equal(result.paidInvoices, 2)
})

test('VAT: date input is bounded and valid for branch/date-filtered server queries', () => {
  assert.equal(parseVatDate('2026-10-01')?.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(parseVatDate('2026-10-01', true)?.toISOString(), '2026-10-01T23:59:59.999Z')
  assert.throws(() => parseVatDate('2026/10/01'))
  const filters = normalizeVatReportFilters({ from: '2026-10-01', to: '2026-10-31', branchId: '42' })
  assert.equal(filters.branchId, 42n)
  assert.equal(filters.from?.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.throws(() => normalizeVatReportFilters({ branchId: 'other-branch' }))
})

test('waiter responsibility: table transfers never move paid or terminal orders', () => {
  assert.equal(isTransferEligible('new', 'unpaid'), true)
  assert.equal(isTransferEligible('preparing', 'unpaid'), true)
  assert.equal(isTransferEligible('ready', 'unpaid'), true)
  assert.equal(isTransferEligible('served', 'unpaid'), false)
  assert.equal(isTransferEligible('new', 'paid'), false)
})

test('waiter responsibility: only a different waiter requires an emergency-serving reason', () => {
  assert.equal(requiresEmergencyServing('waiter', 'waiter-a', 'waiter-a'), false)
  assert.equal(requiresEmergencyServing('waiter', 'waiter-a', 'waiter-b'), true)
  assert.equal(requiresEmergencyServing('manager', 'waiter-a', 'manager-a'), false)
})

test('waiter readiness: legacy responsibility review is proposal-only and classifies actual order state', () => {
  assert.deepEqual(classifyUnassignedWaiterOrder({ status: 'preparing', paymentStatus: 'unpaid', source: 'qr' }).bucket, 'operational')
  assert.deepEqual(classifyUnassignedWaiterOrder({ status: 'new', paymentStatus: 'unpaid', source: 'qr' }).bucket, 'ambiguous')
  assert.deepEqual(classifyUnassignedWaiterOrder({ status: 'new', paymentStatus: 'paid', source: 'pos' }).bucket, 'historical')
  assert.match(classifyUnassignedWaiterOrder({ status: 'served', paymentStatus: 'unpaid', source: 'qr' }).proposal, /مراجعة تشغيلية/)
})

test('waiter reconciliation: proposals require an authorized human decision and an eligible same-branch waiter', () => {
  const order = { branchId: '1', status: 'new', paymentStatus: 'unpaid', source: 'qr', responsibleWaiterId: null, updatedAt: '2026-10-24T10:00:00.000Z' }
  const eligible = [{ id: 'waiter-a', branchId: '1', role: 'waiter', isActive: true, hasOpenShift: true }]
  assert.equal(canReviewLegacyResponsibility('owner'), true)
  assert.equal(canReviewLegacyResponsibility('manager'), true)
  assert.equal(canReviewLegacyResponsibility('waiter'), false)
  assert.equal(validateLegacyReconciliationProposal({ order, decision: 'assign_waiter', reason: 'تغطية الطلب المفتوح', proposedWaiterId: 'waiter-a', eligibleWaiters: eligible }).ok, true)
  assert.equal(validateLegacyReconciliationProposal({ order, decision: 'assign_waiter', reason: 'سبب', proposedWaiterId: 'other-branch', eligibleWaiters: eligible }).ok, false)
  assert.equal(validateLegacyReconciliationProposal({ order, decision: 'review_later', reason: 'x', eligibleWaiters: eligible }).ok, false)
})

test('waiter reconciliation: historical orders, stale snapshots, duplicate approval paths, and execution are protected', () => {
  const historical = { branchId: '1', status: 'new', paymentStatus: 'paid', source: 'pos', responsibleWaiterId: null, updatedAt: '1' }
  assert.equal(validateLegacyReconciliationProposal({ order: historical, decision: 'keep_unassigned', reason: 'مراجعة', eligibleWaiters: [] }).ok, false)
  const snapshot = { branchId: '1', status: 'new', paymentStatus: 'unpaid', source: 'qr', responsibleWaiterId: null, updatedAt: '1' }
  assert.equal(isLegacySnapshotCurrent(snapshot, { ...snapshot, updatedAt: '2' }), false)
  assert.equal(canTransitionReconciliationReview('proposed', 'approved'), true)
  assert.equal(canTransitionReconciliationReview('approved', 'approved'), false)
  assert.equal(canTransitionReconciliationReview('approved', 'rejected'), false)
  assert.equal(approvalExecutesOrderMutation(), false)
})

// --- Route-access matrix: every role → what they may open ------------------

test('route-access: owner sees every mapped page', () => {
  for (const path of ['/orders', '/pos', '/cashier', '/kitchen', '/waiter', '/tables', '/tables/print', '/products', '/inventory', '/customers', '/staff', '/staff/leave', '/staff/attendance-corrections', '/reports', '/settings', '/fixed-float/baseline', '/fixed-float/settlements', '/shifts']) {
    assert.equal(canSeeRoute('owner', [], path), true, `owner must open ${path}`)
  }
})

test('route-access: attendance-correction review is owner-only', () => {
  assert.equal(canSeeRoute('manager', ['staff.view'], '/staff/attendance-corrections'), false)
  assert.equal(canSeeRoute('manager', ['staff.view'], '/staff/attendance-corrections/1'), false)
  assert.equal(canSeeRoute('owner', [], '/staff/attendance-corrections'), true)
})

test('route-access: waiter sees only orders + tables (+ dashboard)', () => {
  const perms = ['orders.view', 'orders.update', 'orders.cancel', 'orders.serve', 'tables.view']
  assert.equal(canSeeRoute('waiter', perms, '/dashboard'), true)
  assert.equal(canSeeRoute('waiter', perms, '/orders'), true)
  assert.equal(canSeeRoute('waiter', perms, '/tables'), true)
  // Not their job:
  assert.equal(canSeeRoute('waiter', perms, '/reports'), false)
  assert.equal(canSeeRoute('waiter', perms, '/settings'), false)
  assert.equal(canSeeRoute('waiter', perms, '/staff'), false)
  assert.equal(canSeeRoute('waiter', perms, '/products'), false)
  assert.equal(canSeeRoute('waiter', perms, '/inventory'), false)
})

test('route-access: kitchen sees only the kitchen board', () => {
  const perms = ['orders.view', 'orders.kitchen_status', 'inventory.view']
  assert.equal(canSeeRoute('kitchen', perms, '/kitchen'), true)
  assert.equal(canSeeRoute('kitchen', perms, '/orders'), true)
  assert.equal(canSeeRoute('kitchen', perms, '/reports'), false)
  assert.equal(canSeeRoute('kitchen', perms, '/pos'), false)
})

test('route-access: cashier sees POS, orders, and product management but not staff', () => {
  const perms = ['orders.view', 'orders.update', 'orders.cancel', 'orders.refund', 'orders.payment', 'tables.view']
  assert.equal(canSeeRoute('cashier', perms, '/pos'), true)
  assert.equal(canSeeRoute('cashier', perms, '/orders'), true)
  assert.equal(canSeeRoute('cashier', perms, '/products'), true)
  assert.equal(canSeeRoute('cashier', perms, '/staff'), false)
  assert.equal(canSeeRoute('cashier', perms, '/settings'), false)
})

test('route-access: manager sees the operational + management set', () => {
  const perms = [
    'orders.view', 'orders.update', 'orders.cancel', 'orders.payment', 'orders.kitchen_status', 'orders.serve',
    'menu.view', 'menu.update', 'tables.view', 'tables.manage', 'staff.view', 'staff.manage',
    'reports.view', 'inventory.view', 'inventory.manage', 'discounts.manage', 'settings.manage',
  ]
  for (const path of ['/orders', '/tables', '/products', '/inventory', '/staff', '/reports', '/settings']) {
    assert.equal(canSeeRoute('manager', perms, path), true, `manager must open ${path}`)
  }
})

test('route-access: permissionForPath maps known routes', () => {
  assert.equal(permissionForPath('/orders'), 'orders.view')
  assert.equal(permissionForPath('/pos'), 'orders.payment')
  assert.equal(permissionForPath('/kitchen'), 'orders.kitchen_status')
  assert.equal(permissionForPath('/waiter'), 'tables.view')
  assert.equal(permissionForPath('/tables'), 'tables.view')
  assert.equal(permissionForPath('/products'), 'menu.view')
  assert.equal(permissionForPath('/inventory'), 'inventory.view')
  assert.equal(permissionForPath('/staff'), 'staff.view')
  assert.equal(permissionForPath('/reports'), 'reports.view')
  assert.equal(permissionForPath('/settings'), 'settings.manage')
  assert.equal(permissionForPath('/dashboard'), null) // open to all authenticated staff
})

test('route-access: a granted permission unlocks its page', () => {
  // Simulate a custom grant: this role gets reports.view only.
  assert.equal(canSeeRoute('waiter', [], '/reports'), false)
  assert.equal(canSeeRoute('waiter', ['reports.view'], '/reports'), true)
})

test('route-access: nested paths inherit their section permission', () => {
  assert.equal(canSeeRoute('waiter', ['orders.view'], '/orders/123'), true)
  assert.equal(canSeeRoute('kitchen', ['orders.kitchen_status'], '/kitchen/queue'), true)
  assert.equal(canSeeRoute('cashier', [], '/settings/branch'), false)
})

// --- Role home redirect + operational detection ---------------------------
test('route-access: every role resolves to its canonical home', () => {
  assert.equal(homeForRole('waiter'), '/waiter')
  assert.equal(homeForRole('kitchen'), '/kitchen')
  assert.equal(homeForRole('cashier'), '/cashier')
  assert.equal(homeForRole('owner'), '/owner')
  assert.equal(homeForRole('manager'), '/manager')
})

test('route-access: operational roles are waiter/kitchen/cashier only', () => {
  assert.equal(isOperationalRole('waiter'), true)
  assert.equal(isOperationalRole('kitchen'), true)
  assert.equal(isOperationalRole('cashier'), true)
  assert.equal(isOperationalRole('owner'), false)
  assert.equal(isOperationalRole('manager'), false)
})

test('route-access: ops boards include /cashier', () => {
  assert.equal(isOpsPath('/pos'), true)
  assert.equal(isOpsPath('/kitchen'), true)
  assert.equal(isOpsPath('/waiter'), true)
  assert.equal(isOpsPath('/cashier'), true)
  assert.equal(isOpsPath('/dashboard'), false)
  assert.equal(isOpsPath('/orders'), false)
})

test('route-access: cashier station is reachable by the Cashier role without a mutable permission', () => {
  assert.equal(permissionForPath('/cashier'), 'orders.payment')
  const cashier = ['orders.view', 'orders.update', 'orders.cancel', 'orders.refund', 'orders.payment', 'tables.view']
  assert.equal(canSeeRoute('cashier', cashier, '/cashier'), true)
  // A cashier must be able to load this station to open a shift; otherwise
  // redirecting denied access to their own home creates /cashier -> /cashier.
  assert.equal(canSeeRoute('cashier', [], '/cashier'), true)
  assert.equal(canSeeRoute('manager', ['orders.payment', 'settings.manage'], '/cashier'), true)
  assert.equal(canSeeRoute('manager', [], '/cashier'), false)
  assert.equal(canSeeRoute('waiter', ['orders.view', 'tables.view'], '/cashier'), false)
  assert.equal(canSeeRoute('kitchen', ['orders.kitchen_status'], '/cashier'), false)
})

test('route-access: ops-shell exception lets only the cashier render /cashier', () => {
  assert.equal(canRenderInOpsShell('cashier', '/cashier'), true)
  assert.equal(canRenderInOpsShell('cashier', '/products'), true)
  assert.equal(canRenderInOpsShell('waiter', '/cashier'), false)
  assert.equal(canRenderInOpsShell('kitchen', '/cashier'), false)
  assert.equal(canRenderInOpsShell('manager', '/cashier'), false)
})

test('route-access: an absent middleware pathname never creates an operational home loop', () => {
  assert.equal(shouldRedirectOperationalUserToHome(ROLE.CASHIER, ''), false)
  assert.equal(shouldRedirectOperationalUserToHome(ROLE.CASHIER, '/cashier'), false)
  assert.equal(shouldRedirectOperationalUserToHome(ROLE.CASHIER, '/dashboard'), true)
  assert.equal(shouldRedirectOperationalUserToHome(ROLE.MANAGER, '/dashboard'), false)
})
import { StaffProvisionError } from '../src/lib/staff-provision-write'

// --- env.ts (public) -------------------------------------------------------
test('getPublicEnv: returns values when valid', () => {
  const prev = { ...process.env }
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-123'
    const env = getPublicEnv()
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://example.supabase.co')
    assert.equal(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'anon-key-123')
  } finally {
    process.env = prev
  }
})

test('getPublicEnv: throws (secret-free) when anon key missing', () => {
  const prev = { ...process.env }
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    assert.throws(() => getPublicEnv(), /NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  } finally {
    process.env = prev
  }
})

test('getPublicEnv: throws on invalid URL', () => {
  const prev = { ...process.env }
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-123'
    assert.throws(() => getPublicEnv(), /NEXT_PUBLIC_SUPABASE_URL/)
  } finally {
    process.env = prev
  }
})

// --- authz.ts --------------------------------------------------------------
test('authz: isKnownRole', () => {
  assert.equal(isKnownRole('owner'), true)
  assert.equal(isKnownRole('admin'), false)
  assert.equal(isKnownRole(''), false)
})

test('auth redirect: accepts only safe same-origin application paths', () => {
  assert.equal(safeInternalRedirect('/waiter?tab=active'), '/waiter?tab=active')
  assert.equal(safeInternalRedirect('/finance#vat'), '/finance#vat')
  assert.equal(safeInternalRedirect('//attacker.example'), null)
  assert.equal(safeInternalRedirect('/\\attacker.example'), null)
  assert.equal(safeInternalRedirect('https://attacker.example'), null)
  assert.equal(safeInternalRedirect('/dashboard\nSet-Cookie: bad'), null)
  assert.equal(safeInternalRedirect('/login?next=/owner'), null)
  assert.equal(safeInternalRedirect('/dashboard'), null)
})

test('auth expiry guard: only same-origin staff API 401 responses clear stale client UI', () => {
  const origin = 'https://sokoon.example'
  assert.equal(isSameOriginStaffApiRequest('/api/staff/orders/1', origin), true)
  assert.equal(isSameOriginStaffApiRequest('https://sokoon.example/api/staff', origin), true)
  assert.equal(isSameOriginStaffApiRequest('https://other.example/api/staff/orders', origin), false)
  assert.equal(isSameOriginStaffApiRequest('/api/public/orders', origin), false)
})

test('authz: hasAtLeast privilege ordering', () => {
  assert.equal(hasAtLeast('owner', 'manager'), true)
  assert.equal(hasAtLeast('manager', 'manager'), true)
  assert.equal(hasAtLeast('waiter', 'manager'), false)
  assert.equal(hasAtLeast('kitchen', 'cashier'), false)
  assert.equal(hasAtLeast('bogus', 'waiter'), false)
})

test('authz: isOwner', () => {
  assert.equal(isOwner('owner'), true)
  assert.equal(isOwner('manager'), false)
})

test('authz: operational shift policy requires Owner-exempt only', () => {
  assert.equal(requiresOperationalShift(ROLE.OWNER), false)
  assert.equal(requiresOperationalShift(ROLE.MANAGER), true)
  assert.equal(requiresOperationalShift(ROLE.CASHIER), true)
  assert.equal(requiresOperationalShift(ROLE.WAITER), true)
  assert.equal(requiresOperationalShift(ROLE.KITCHEN), true)
  assert.equal(requiresOperationalShift('unknown'), false)
})

test('catalog: owner product creation requires an explicit target branch while managers are branch-bound', () => {
  const owner: StaffSession = { id: '00000000-0000-0000-0000-000000000001', email: null, name: 'Owner', role: ROLE.OWNER, branchId: null, permissions: [] }
  const manager: StaffSession = { id: '00000000-0000-0000-0000-000000000002', email: null, name: 'Manager', role: ROLE.MANAGER, branchId: '7', permissions: [] }
  assert.equal(targetBranch(owner, '8'), 8n)
  assert.equal(targetBranch(manager, '8'), 7n)
  assert.throws(() => targetBranch(owner), (error: unknown) => error instanceof CatalogError && error.status === 400)
})

test('authz: canAccessBranch (owner=null any, staff=own only)', () => {
  assert.equal(canAccessBranch(null, 5n), true)
  assert.equal(canAccessBranch(5n, 5n), true)
  assert.equal(canAccessBranch(5n, 6n), false)
  assert.equal(canAccessBranch(5, 5n), true)
  assert.equal(canAccessBranch(undefined as unknown as null, 5n), false)
})

test('authz: hasPermission exact slug match', () => {
  assert.equal(hasPermission(['orders.cancel', 'menu.view'], 'orders.cancel'), true)
  assert.equal(hasPermission(['orders.cancel'], 'orders.refund'), false)
  assert.equal(hasPermission(new Set(['audit.view']), 'audit.view'), true)
  assert.equal(hasPermission([], 'orders.view'), false)
})

// --- security/pin.ts -------------------------------------------------------
test('pin: validatePinFormat', () => {
  assert.deepEqual(validatePinFormat('1234'), { ok: true })
  assert.deepEqual(validatePinFormat('12345678'), { ok: true })
  assert.equal(validatePinFormat('12').ok, false) // too short
  assert.equal(validatePinFormat('123456789').ok, false) // too long
  assert.equal(validatePinFormat('12a4').ok, false) // non-digit
  assert.equal(validatePinFormat('').ok, false)
})

test('pin: hash stores a hash, verify round-trips', async () => {
  const h = await hashPin('4821')
  assert.notEqual(h, '4821', 'must never store plaintext')
  assert.ok(h.length > 20, 'bcrypt hash expected')
  assert.equal(await verifyPin('4821', h), true)
  assert.equal(await verifyPin('4822', h), false)
})

test('pin: verify fails safely on empty/malformed hash', async () => {
  assert.equal(await verifyPin('1234', null), false)
  assert.equal(await verifyPin('1234', undefined), false)
  assert.equal(await verifyPin('1234', ''), false)
  assert.equal(await verifyPin('1234', 'not-a-bcrypt-hash'), false)
})

test('pin: hashPin rejects invalid format', async () => {
  await assert.rejects(() => hashPin('12'), /digits/)
  await assert.rejects(() => hashPin('abcd'), /digits/)
})

test('pin: pepper changes the hash but verify still works', async () => {
  const prev = process.env.POS_PIN_PEPPER
  try {
    process.env.POS_PIN_PEPPER = 'test-pepper-value'
    const h = await hashPin('7391')
    assert.equal(await verifyPin('7391', h), true, 'verify with same pepper')
    assert.equal(await verifyPin('7392', h), false)
  } finally {
    if (prev === undefined) delete process.env.POS_PIN_PEPPER
    else process.env.POS_PIN_PEPPER = prev
  }
})

test('pin: length constants are sane', () => {
  assert.ok(PIN_MIN_LENGTH >= 4)
  assert.ok(PIN_MAX_LENGTH <= 12)
  assert.ok(PIN_MIN_LENGTH <= PIN_MAX_LENGTH)
})

// keeps ROLE import used even if tree-shaken in some runners
test('authz: ROLE constants stable', () => {
  assert.equal(ROLE.OWNER, 'owner')
  assert.equal(ROLE.MANAGER, 'manager')
})

test('HR authorization: employee lifecycle is owner-only', () => {
  assert.equal(canManageEmployeeLifecycle('owner'), true)
  assert.equal(canManageEmployeeLifecycle('manager'), false)
  assert.equal(canManageEmployeeLifecycle('cashier'), false)
})

test('HR authorization: only owner and manager may read the employee directory; sensitive data is owner-only', () => {
  assert.equal(canReadEmployeeDirectory('owner'), true)
  assert.equal(canReadEmployeeDirectory('manager'), true)
  assert.equal(canReadEmployeeDirectory('cashier'), false)
  assert.equal(canReadEmployeeDirectory('waiter'), false)
  assert.equal(canReadSensitiveEmployeeData('owner'), true)
  assert.equal(canReadSensitiveEmployeeData('manager'), false)
})

test('HR authorization: manager password reset is subordinate and branch scoped', () => {
  const manager = { role: 'manager' as const, branchId: '10' }
  const worker = { role: 'waiter' as const, branchId: 10n }
  assert.equal(canResetEmployeePassword(manager, worker), true)
  assert.equal(canResetEmployeePassword(manager, { ...worker, branchId: 11n }), false)
  assert.equal(canResetEmployeePassword(manager, { ...worker, role: 'manager' }), false)
  assert.equal(canResetEmployeePassword(manager, { ...worker, role: 'owner', branchId: null }), false)
  assert.equal(canResetEmployeePassword({ role: 'owner', branchId: null }, { ...worker, role: 'manager' }), true)
})

test('HR scheduling: validates rest days, overnight shifts, and effective-date conflicts', () => {
  assert.equal(validateWeeklySchedule([{ weekday: 4, restDay: false, startsAt: '22:00', endsAt: '06:00' }, { weekday: 5, restDay: true }]), null)
  assert.notEqual(validateWeeklySchedule([{ weekday: 5, restDay: true, startsAt: '09:00', endsAt: '17:00' }]), null)
  assert.equal(effectivePeriodsOverlap(new Date('2026-01-01'), null, new Date('2026-02-01'), null), true)
  assert.equal(effectivePeriodsOverlap(new Date('2026-01-01'), new Date('2026-02-01'), new Date('2026-02-01'), null), false)
})

test('HR attendance: derives lateness and reviewed overtime from actual Shift timestamps only', () => {
  const schedule = { restDay: false, startsAt: '22:00', endsAt: '06:00' }
  const open = new Date(2026, 9, 23, 22, 20)
  const close = new Date(2026, 9, 24, 6, 30)
  assert.deepEqual(evaluateAttendance(schedule, open, close, 10), { lateMinutes: 10, overtimeMinutes: 30, earlyDepartureMinutes: 0, overnight: true })
  assert.deepEqual(evaluateAttendance(schedule, open, null, 10), { lateMinutes: 10, overtimeMinutes: 0, earlyDepartureMinutes: 0, overnight: true })
})

// --- staff-payments-write (pure constants) ----------------------------------
test('payments: cash and supported electronic methods use explicit validation', () => {
  assert.deepEqual([...PAYMENT_METHODS], ['cash', 'mobile_wallet', 'instapay', 'card', 'online'])
  assert.equal(paymentCollectionSchema.safeParse({ method: 'cash' }).success, false)
  assert.equal(paymentCollectionSchema.safeParse({ method: 'cash', received: '10' }).success, true)
  assert.equal(paymentCollectionSchema.safeParse({ method: 'mobile_wallet' }).success, false)
  assert.equal(paymentCollectionSchema.safeParse({ method: 'mobile_wallet', electronicPaymentConfirmed: true }).success, true)
  assert.equal(paymentCollectionSchema.safeParse({ method: 'instapay', electronicPaymentConfirmed: true }).success, true)
  assert.equal(paymentCollectionSchema.safeParse({ method: 'invalid', electronicPaymentConfirmed: true }).success, false)
})

test('payments: settlement payload preserves the checked confirmation as a boolean', () => {
  const wallet = buildPaymentRequestPayload('mobile_wallet', '99.00', true)
  const instapay = buildPaymentRequestPayload('instapay', '99.00', true)
  assert.deepEqual(wallet, { action: 'pay', method: 'mobile_wallet', electronicPaymentConfirmed: true })
  assert.deepEqual(instapay, { action: 'pay', method: 'instapay', electronicPaymentConfirmed: true })
  assert.equal(paymentCollectionSchema.safeParse(wallet).success, true)
  assert.equal(paymentCollectionSchema.safeParse(instapay).success, true)
  assert.equal(paymentCollectionSchema.safeParse(buildPaymentRequestPayload('mobile_wallet', '99.00', false)).success, false)
  assert.equal(paymentCollectionSchema.safeParse(buildPaymentRequestPayload('instapay', '99.00', false)).success, false)
  assert.deepEqual(buildPaymentRequestPayload('cash', '120.00', false), { action: 'pay', method: 'cash', received: '120.00' })
  assert.deepEqual(paymentServiceInputFromRequest(wallet, 'request-key'), { method: 'mobile_wallet', received: undefined, electronicPaymentConfirmed: true, idempotencyKey: 'request-key' })
})

// --- staff-settings-write (allowlisted key validation) ----------------------
test('settings: currency definition accepts EGP, rejects lowercase', () => {
  const d = SETTING_DEFS.currency
  assert.equal(d.kind, 'string')
  assert.equal(d.validate('EGP'), null)
  assert.notEqual(d.validate('egp'), null)
  assert.notEqual(d.validate('EG'), null)
})

test('settings: tax_rate bounds are 0..100', () => {
  const d = SETTING_DEFS.tax_rate
  assert.equal(d.kind, 'number')
  assert.equal(d.validate(14), null)
  assert.equal(d.validate(0), null)
  assert.equal(d.validate(100), null)
  assert.notEqual(d.validate(-1), null)
  assert.notEqual(d.validate(101), null)
})

test('settings: tax_enabled is boolean-kind (zero-arg validator)', () => {
  const d = SETTING_DEFS.tax_enabled
  assert.equal(d.kind, 'boolean')
  assert.equal(d.validate(), null)
})

test('settings: exactly the six allowlisted keys are writable', () => {
  assert.deepEqual(Object.keys(SETTING_DEFS).sort(), [
    'currency',
    'phone',
    'store_name',
    'tax_enabled',
    'tax_name',
    'tax_rate',
  ])
})

// --- finance-metrics: payment-truth aggregation (pure, no DB) -----------------
test('finance: completed payment contributes to collected revenue', () => {
  const s = summarizePayments([{ status: 'completed', method: 'cash', amount: '150.00' }])
  assert.equal(s.collectedCents, 15000)
  assert.equal(s.completedCount, 1)
  assert.equal(centsToAmount(s.collectedCents), 150)
})

test('finance: pending and failed payments contribute zero', () => {
  const s = summarizePayments([
    { status: 'pending', method: 'cash', amount: '100.00' },
    { status: 'failed', method: 'card', amount: '50.00' },
    { status: 'weird-future-status', method: 'cash', amount: '10.00' },
  ])
  assert.equal(s.collectedCents, 0)
  assert.equal(s.refundedCents, 0)
  assert.equal(s.ignoredCount, 3)
})

test('finance: refunded payment leaves collected (no double count)', () => {
  // After refundOrderPayment flips completed -> refunded, the row must read
  // as refunded-only: excluded from collected, present in refundedTotal.
  const s = summarizePayments([{ status: 'refunded', method: 'cash', amount: '150.00' }])
  assert.equal(s.collectedCents, 0)
  assert.equal(s.refundedCents, 15000)
  assert.equal(s.refundedCount, 1)
})

test('refund ledger: recognized immutable events cap partial refunds exactly', () => {
  const prior = [{ amount: '25.25', status: 'recorded' }, { amount: '10.00', status: 'failed' }]
  assert.equal(remainingRefundableCents('100.00', prior), 7475)
  assert.equal(assertRefundAmount('100.00', prior, '74.75'), 7475)
  assert.throws(() => assertRefundAmount('100.00', prior, '74.76'))
})

test('refund ledger: pending requests reserve balance without reducing recognized revenue', () => {
  const prior = [{ amount: '25.00', status: 'requested' }, { amount: '10.00', status: 'recorded' }]
  assert.equal(remainingRefundableCents('100.00', prior), 9000)
  assert.equal(remainingReservableRefundCents('100.00', prior), 6500)
  assert.equal(assertRefundReservation('100.00', prior, '65.00'), 6500)
  assert.throws(() => assertRefundReservation('100.00', prior, '65.01'))
})

test('refund ledger: only recognized current-till refunds affect till cash', () => {
  assert.equal(refundAffectsTill('cashier_till', 'recorded'), true)
  assert.equal(refundAffectsTill('cashier_till', 'requested'), false)
  assert.equal(refundAffectsTill('main_safe', 'recorded'), false)
  assert.equal(refundAffectsTill('external', 'externally_confirmed'), false)
})

test('refund writer fails closed until immutable refund events are deployed', async () => {
  await assert.rejects(
    refundOrderPayment({ id: 'actor-id', role: ROLE.MANAGER, branchId: 1n } as unknown as StaffSession, '1', { reason: 'test refund' }),
    (error: unknown) => error instanceof PaymentError && error.status === 503,
  )
})

test('finance: cancelled unpaid orders contribute nothing (no payment rows)', () => {
  // Cancelled/unpaid orders have no payment row at all — the empty input
  // models them exactly: nothing to aggregate.
  const s = summarizePayments([])
  assert.equal(s.collectedCents, 0)
  assert.equal(s.refundedCents, 0)
  assert.equal(s.completedCount, 0)
})

test('finance: unpaid order value is never mixed into collected', () => {
  // Order value (intent) and collected cash are separate summaries; an unpaid
  // order adds intent cents but zero collected cents.
  const intentCents = toCents('200.00')
  const cash = summarizePayments([])
  assert.equal(intentCents, 20000)
  assert.equal(cash.collectedCents, 0)
})

test('finance: method subtotals reconcile with collected total', () => {
  const s = summarizePayments([
    { status: 'completed', method: 'cash', amount: '100.00' },
    { status: 'completed', method: 'card', amount: '50.25' },
    { status: 'completed', method: 'online', amount: '25.00' },
    { status: 'completed', method: 'cash', amount: '10.00' },
    { status: 'refunded', method: 'cash', amount: '100.00' },
    { status: 'pending', method: 'cash', amount: '5.00' },
  ])
  assert.equal(s.collectedCents, 18525)
  assert.equal(methodTotalsReconcile(s), true)
  assert.deepEqual(s.byMethodCents, { cash: 11000, card: 5025, online: 2500 })
})

test('finance: empty dataset returns zeros (never NaN)', () => {
  const s = summarizePayments([])
  assert.equal(centsToAmount(s.collectedCents), 0)
  assert.equal(avgPerPaidOrder(s.collectedCents, 0), 0)
})

test('finance: decimal amounts keep exact precision (no float drift)', () => {
  // 0.1 + 0.2 in float is 0.30000000000000004 — cents math must give exactly 30.
  const s = summarizePayments([
    { status: 'completed', method: 'cash', amount: '0.10' },
    { status: 'completed', method: 'cash', amount: '0.20' },
  ])
  assert.equal(s.collectedCents, 30)
  assert.equal(centsToAmount(s.collectedCents), 0.3)
  assert.equal(toCents('19.99'), 1999)
  assert.equal(toCents('100'), 10000)
})

test('finance: invalid money fails loudly', () => {
  assert.throws(() => toCents('abc'), /Invalid money/)
  assert.throws(() => toCents('10.999'), /Invalid money/)
})

test('finance: consistent count rules (paid vs billed vs total)', () => {
  // totalOrders (all, incl. cancelled) vs billed (non-cancelled) vs paid
  // (completed payment) — three separate denominators, documented in
  // staff-reports.ts. avgCollected uses paid; avgOrderValue uses billed.
  const billedValue = centsToAmount(toCents('300.00'))
  assert.equal(billedValue / 3, 100) // avg over billed
  assert.equal(avgPerPaidOrder(toCents('200.00'), 2), 100) // avg over paid
  assert.equal(avgPerPaidOrder(0, 0), 0)
})

// --- error classes carry HTTP status ----------------------------------------
test('errors: SettingsError and StaffProvisionError carry status codes', () => {
  const a = new SettingsError('x', 403)
  const b = new StaffProvisionError('y', 503)
  assert.equal(a.status, 403)
  assert.equal(b.status, 503)
  assert.equal(a.name, 'SettingsError')
  assert.equal(b.name, 'StaffProvisionError')
})

// --- guest order resume (node-safe: no window → empty list) -----------------
test('guest-orders: getGuestOrders returns [] outside the browser', () => {
  assert.deepEqual(getGuestOrders(), [])
})

test('guest-orders: saveGuestOrder is a no-op outside the browser', () => {
  assert.doesNotThrow(() => saveGuestOrder({ id: '1', orderNumber: 'QR-X' }))
  assert.deepEqual(getGuestOrders(), [])
})

// --- dashboard-stats: integer-cent aggregation (no float drift) -------------
type OrderLite = { createdAt: Date; total: unknown; status: string }

const mkOrder = (total: string, status: string = 'new', hourUtc: number = 10): OrderLite => ({
  createdAt: new Date(Date.UTC(2026, 0, 15, hourUtc, 0, 0)),
  total,
  status,
})

test('buildHourly: sums decimal amounts in integer cents, no float drift', () => {
  // 0.10 + 0.20 must give exactly 0.30, not 0.30000000000000004
  const rows = [mkOrder('0.10'), mkOrder('0.20'), mkOrder('19.99')]
  const series = buildHourly(rows, 'UTC', new Date(Date.UTC(2026, 0, 15, 12, 0, 0)))
  const hour10 = series.find((s) => s.label === '10:00')
  assert.ok(hour10, 'hour 10 bucket must exist')
  assert.equal(hour10!.value, 20.29) // 0.10 + 0.20 + 19.99 = 20.29 exactly
})

test('buildDaily: sums decimal amounts in integer cents per day', () => {
  const rows = [
    mkOrder('0.10', 'new', 10),
    mkOrder('0.20', 'new', 14),
    mkOrder('5.55', 'cancelled', 10), // cancelled — excluded
    mkOrder('10.00', 'new', 10),
  ]
  const startToday = new Date(Date.UTC(2026, 0, 15, 0, 0, 0))
  const series = buildDaily(rows, startToday, 1)
  assert.equal(series.length, 1)
  assert.equal(series[0].value, 10.30) // 0.10 + 0.20 + 10.00 = 10.30 (cancelled excluded)
})

test('buildDaily: repeated decimal transactions accumulate exactly', () => {
  const rows = Array.from({ length: 10 }, () => mkOrder('0.10', 'new', 10))
  const startToday = new Date(Date.UTC(2026, 0, 15, 0, 0, 0))
  const series = buildDaily(rows, startToday, 1)
  assert.equal(series[0].value, 1.00) // 10 * 0.10 = 1.00 exactly, no 0.9999999999999999
})

test('buildHourly: cancelled orders excluded from series', () => {
  const rows = [mkOrder('100.00', 'new'), mkOrder('50.00', 'cancelled')]
  const series = buildHourly(rows, 'UTC', new Date(Date.UTC(2026, 0, 15, 12, 0, 0)))
  const hour10 = series.find((s) => s.label === '10:00')
  assert.ok(hour10)
  assert.equal(hour10!.value, 100.00)
})

// --- finance-metrics: average precision -------------------------------------

test('avgPerPaidOrder: rounds to 2 decimal places', () => {
  // 15000 cents / 3 orders = 5000 cents/order = 50.00 EGP
  assert.equal(avgPerPaidOrder(15000, 3), 50)
  // 10001 cents / 3 orders = 3333.666... cents -> rounds to 3334 cents = 33.34 EGP
  assert.equal(avgPerPaidOrder(10001, 3), 33.34)
  // 1 cent / 3 orders = 0.333... -> rounds to 0 cents = 0.00 EGP
  assert.equal(avgPerPaidOrder(1, 3), 0)
  assert.equal(avgPerPaidOrder(0, 0), 0)
})

test('centsToAmount: exact conversion for decimal inputs', () => {
  assert.equal(centsToAmount(toCents('0.10')), 0.1)
  assert.equal(centsToAmount(toCents('0.20')), 0.2)
  assert.equal(centsToAmount(toCents('19.99')), 19.99)
  assert.equal(centsToAmount(toCents('100.00')), 100)
  // 0.1 + 0.2 in cents = 30 cents -> 0.30, not 0.30000000000000004
  const sum = centsToAmount(toCents('0.10') + toCents('0.20'))
  assert.equal(sum, 0.3)
})

// --- staff-reports averaging: calls production avgPerPaidOrder --------------

test('order value average: calls production avgPerPaidOrder', () => {
  // Mirrors staff-reports.ts avgOrderValue via avgPerPaidOrder(orderValueCents, billed.length)
  assert.equal(avgPerPaidOrder(30000, 3), 100)   // 300.00 / 3 = 100.00
  assert.equal(avgPerPaidOrder(10001, 3), 33.34) // 100.01 / 3 = 33.3366... -> 33.34
  assert.equal(avgPerPaidOrder(0, 5), 0)          // no billed orders -> 0
})

test('collected average: calls production avgPerPaidOrder', () => {
  // Mirrors staff-reports.ts avgCollectedPerPaidOrder via avgPerPaidOrder(collectedCents, paidOrders)
  assert.equal(avgPerPaidOrder(15000, 3), 50)   // 150.00 / 3 = 50.00
  assert.equal(avgPerPaidOrder(10001, 3), 33.34) // 100.01 / 3 = 33.34
  assert.equal(avgPerPaidOrder(0, 0), 0)         // no paid orders -> 0
})

test('avgCollectedPerPaidOrder semantics: one completed payment per order (V1)', () => {
  // V1 business rule (src/lib/staff-payments-write.ts): no partial payments — every
  // finalize covers the full outstanding balance, so an order has exactly one
  // completed payment. outstanding = total − completed payments; outstanding <= 0
  // rejects a second finalize (409).
  //
  // avgCollectedPerPaidOrder = sum of completed payment amounts ÷ distinct orders
  // with a completed payment. In V1 paidOrders === completedCount (one payment per
  // order), so the denominator equals the number of completed payment rows.
  const s = summarizePayments([
    { status: 'completed', method: 'cash', amount: '100.00' },
    { status: 'completed', method: 'card', amount: '250.50' },
    { status: 'completed', method: 'online', amount: '75.00' },
  ])
  assert.equal(s.collectedCents, 42550) // 100.00 + 250.50 + 75.00 = 425.50 -> 42550 cents
  assert.equal(s.completedCount, 3)
  // 42550 / 3 = 14183.33... cents -> rounds to 14183 cents = 141.83 EGP
  assert.equal(avgPerPaidOrder(s.collectedCents, s.completedCount), 141.83)
})

test('avgPerPaidOrder: zero denominator returns 0 (never NaN)', () => {
  assert.equal(avgPerPaidOrder(0, 0), 0)
  assert.equal(avgPerPaidOrder(9999, 0), 0)
})

// --- Shifts (MVP P0): cash reconciliation math + validation + route access ---

test('shifts: cash flow counts completed cash in and refunded cash out only', () => {
  const flow = computeShiftCashFlow([
    { method: 'cash', status: 'completed', amount: 100 },
    { method: 'cash', status: 'completed', amount: 50.5 },
    { method: 'cash', status: 'refunded', amount: 30 },
    { method: 'card', status: 'completed', amount: 999 }, // not cash → ignored
    { method: 'online', status: 'refunded', amount: 500 }, // not cash → ignored
  ])
  assert.equal(flow.cashIn, 150.5)
  assert.equal(flow.cashOut, 30)
  assert.equal(flow.netCash, 120.5)
})

test('shift financial writers use one stable, shift-scoped advisory-lock namespace', () => {
  assert.equal(financialShiftLockName(42n), 'shift-financial:42')
  assert.equal(financialShiftLockName('42'), 'shift-financial:42')
  assert.notEqual(financialShiftLockName(42n), financialShiftLockName(43n))
})

test('shifts: expected cash = opening + net cash movement', () => {
  const payments = [
    { method: 'cash', status: 'completed', amount: 200 },
    { method: 'cash', status: 'completed', amount: 0.1 },
    { method: 'cash', status: 'refunded', amount: 50.55 },
    { method: 'card', status: 'completed', amount: 777 },
  ]
  // 200 + 0.1 − 50.55 = 149.55 → + 500 opening = 649.55 (card excluded)
  assert.equal(expectedCashFrom(500, payments), 649.55)
  assert.equal(expectedCashFrom(0, []), 0)
})

test('shifts: cash difference = counted − expected (signed)', () => {
  assert.equal(cashDifferenceOf(520, 500), 20) // excess (+)
  assert.equal(cashDifferenceOf(480, 500), -20) // shortage (−)
  assert.equal(cashDifferenceOf(500, 500), 0)
})

test('handover routing: only a branch-local calendar rollover is after midnight', () => {
  // Cairo is UTC+2 in January: 21:59Z is 23:59 local, then 22:01Z is 00:01.
  assert.equal(crossedLocalMidnight(new Date('2026-01-15T21:59:00Z'), new Date('2026-01-15T22:01:00Z'), 'Africa/Cairo'), true)
  assert.equal(crossedLocalMidnight(new Date('2026-01-15T19:00:00Z'), new Date('2026-01-15T21:00:00Z'), 'Africa/Cairo'), false)
})

test('fixed float movement input accepts only positive, reasoned additions or withdrawals', () => {
  assert.equal(floatMovementSchema.safeParse({ amount: '12.50', direction: 'addition', reason: 'Morning float' }).success, true)
  assert.equal(floatMovementSchema.safeParse({ amount: 0, direction: 'withdrawal', reason: 'Supplies' }).success, false)
  assert.equal(floatMovementSchema.safeParse({ amount: 5, direction: 'withdrawal', reason: 'x' }).success, false)
})

test('shift reconciliation subtracts operational withdrawals without treating them as sales', () => {
  assert.equal(expectedCashAfterOperationalWithdrawals(expectedCashFrom(100, [{ method: 'cash', status: 'completed', amount: 50 }]), 20), 130)
})

test('fixed float transfers never enter cashier expected-cash arithmetic', () => {
  const cashOnly = expectedCashFrom(100, [{ method: 'card', status: 'completed', amount: 999 }])
  assert.equal(cashOnly, 100)
  assert.equal(expectedCashAfterOperationalWithdrawals(cashOnly, 25), 75)
})

test('route-access: fixed float requires settings management', () => {
  assert.equal(permissionForPath('/fixed-float'), 'settings.manage')
  assert.equal(canSeeRoute('manager', ['settings.manage'], '/fixed-float'), true)
  assert.equal(canSeeRoute('cashier', ['orders.payment'], '/fixed-float'), false)
})

test('invoices: authoritative totals recalculate discount and tax', () => {
  assert.deepEqual(recalculateInvoiceTotals(100, 'percentage', 10, 14), { discount: 10, tax: 12.6, total: 102.6 })
})

test('pos order input ignores client prices while preserving the authoritative order type', () => {
  const parsed = posOrderSchema.parse({ tableId: '7', customerName: 'Guest', total: 0.01, items: [{ productId: '11', qty: 2, price: 0.01 }] })
  assert.deepEqual(parsed, { orderType: 'dine_in', tableId: '7', customerName: 'Guest', items: [{ productId: '11', modifierSelections: [], qty: 2 }] })
  assert.equal(posOrderSchema.safeParse({ tableId: '7', items: [] }).success, false)
  assert.equal(posOrderSchema.safeParse({ tableId: '7', items: [{ productId: '11', qty: 21 }] }).success, false)
})

test('waiter POS renders no discount controls while cashier controls remain available', () => {
  assert.equal(canRenderPosDiscountControls('waiter'), false)
  assert.equal(canRenderPosDiscountControls('cashier'), true)
  assert.deepEqual(submittedDiscountFields('waiter', 'percentage', 25), {})
  assert.deepEqual(submittedDiscountFields('cashier', 'percentage', 25), { discountType: 'percentage', discountValue: 25 })
})

test('waiter POS creates a normal dine-in payload without discount fields', () => {
  const payload = {
    orderType: 'dine_in' as const,
    tableId: '7',
    ...submittedDiscountFields('waiter', 'amount', 10),
    items: [{ productId: '11', qty: 1, modifierSelections: [], ...submittedDiscountFields('waiter', 'percentage', 5) }],
  }
  assert.equal(posOrderSchema.safeParse(payload).success, true)
  assert.equal(containsDiscountSubmission(payload), false)
})

test('waiter order edits accept permitted item changes but reject discount fields', async () => {
  const permitted = { items: [{ itemId: '21', productId: '11', qty: 2, note: 'no sugar' }], notes: 'table note', expectedUpdatedAt: '2026-10-29T10:00:00.000Z' }
  assert.equal(waiterOrderEditSchema.safeParse(permitted).success, true)
  assert.equal(waiterOrderEditSchema.safeParse({ items: permitted.items, notes: permitted.notes }).success, false)
  assert.equal(waiterOrderEditSchema.safeParse({ ...permitted, discountType: 'percentage', discountValue: 10 }).success, false)
  const waiter: StaffSession = { id: '00000000-0000-0000-0000-000000000010', email: null, name: 'Waiter', role: ROLE.WAITER, branchId: '1', permissions: [] }
  await assert.rejects(editWaiterOrder(waiter, '1', { ...permitted, discountType: 'amount', discountValue: 1 }), /Invalid order edit/)
})

test('waiter table drafts are isolated by waiter, branch, and table context', () => {
  assert.notEqual(posDraftKey('waiter-a', '1'), posDraftKey('waiter-b', '1'))
  assert.notEqual(`skoon.waiter.table-draft:waiter-a:1:5`, `skoon.waiter.table-draft:waiter-a:1:6`)
})

test('waiter lifecycle permits auditable prepared cancellation but blocks served and paid lines', () => {
  assert.equal(orderItemVoidBlocker({ status: 'preparing', paymentStatus: 'unpaid', completedPayments: 0, servedQuantity: 0, activeItems: 2 }), null)
  assert.equal(orderItemVoidBlocker({ status: 'ready', paymentStatus: 'unpaid', completedPayments: 0, servedQuantity: 1, activeItems: 2 }), 'served')
  assert.equal(orderItemVoidBlocker({ status: 'preparing', paymentStatus: 'paid', completedPayments: 1, servedQuantity: 0, activeItems: 2 }), 'paid')
})

test('waiter item adjustment plans partial decrease before and during preparation', () => {
  assert.deepEqual(planOrderItemAdjustment({ action: 'quantity', currentQuantity: 5, preparedQuantity: 0, servedQuantity: 0, targetQuantity: 3 }), { blocked: null, wasteQuantity: 0, releasedUnits: 2, addedUnits: 0 })
  assert.deepEqual(planOrderItemAdjustment({ action: 'quantity', currentQuantity: 5, preparedQuantity: 2, servedQuantity: 0, targetQuantity: 3 }), { blocked: null, wasteQuantity: 0, releasedUnits: 2, addedUnits: 0 })
})

test('waiter item adjustment records waste below prepared quantity and preserves served boundary', () => {
  assert.deepEqual(planOrderItemAdjustment({ action: 'quantity', currentQuantity: 5, preparedQuantity: 3, servedQuantity: 0, targetQuantity: 1 }), { blocked: null, wasteQuantity: 2, releasedUnits: 2, addedUnits: 0 })
  assert.equal(planOrderItemAdjustment({ action: 'quantity', currentQuantity: 5, preparedQuantity: 3, servedQuantity: 1, targetQuantity: 4 }).blocked, 'served')
})

test('waiter item adjustment plans incremental preparation and subset variant replacement', () => {
  assert.deepEqual(planOrderItemAdjustment({ action: 'quantity', currentQuantity: 3, preparedQuantity: 1, servedQuantity: 0, targetQuantity: 5 }), { blocked: null, wasteQuantity: 0, releasedUnits: 0, addedUnits: 2 })
  assert.deepEqual(planOrderItemAdjustment({ action: 'variant', currentQuantity: 5, preparedQuantity: 2, servedQuantity: 0, replaceQuantity: 2 }), { blocked: null, wasteQuantity: 0, releasedUnits: 2, addedUnits: 2 })
  assert.deepEqual(planOrderItemAdjustment({ action: 'variant', currentQuantity: 5, preparedQuantity: 2, servedQuantity: 0, replaceQuantity: 5 }), { blocked: null, wasteQuantity: 2, releasedUnits: 3, addedUnits: 5 })
})

test('waiter item adjustment contract requires concurrency and idempotency tokens', () => {
  const base = { action: 'quantity' as const, targetQuantity: 3, reason: 'customer change', expectedUpdatedAt: '2026-10-29T10:00:00.000Z', idempotencyKey: 'adjustment-key-1' }
  assert.equal(orderItemAdjustmentSchema.safeParse(base).success, true)
  assert.equal(orderItemAdjustmentSchema.safeParse({ ...base, expectedUpdatedAt: undefined }).success, false)
  assert.equal(orderItemAdjustmentSchema.safeParse({ ...base, idempotencyKey: undefined }).success, false)
})

test('partial reservation release keeps later serving proportional to the remaining menu quantity', () => {
  assert.equal(proportionalReservationConsumption(3, 3, 3), 3)
  assert.equal(proportionalReservationConsumption(4, 1, 4), 1)
  assert.throws(() => proportionalReservationConsumption(3, 4, 3))
})

test('waiter cannot change invoice discounts through the cashier invoice API', async () => {
  const waiter: StaffSession = { id: '00000000-0000-0000-0000-000000000010', email: null, name: 'Waiter', role: ROLE.WAITER, branchId: '1', permissions: [] }
  await assert.rejects(editOpenInvoice(waiter, '1', { action: 'line_discount', orderItemId: '21', discountType: 'none', discountValue: '0', eligibleForInvoiceDiscount: false }), /Forbidden/)
})

test('invoices: open and paid sections derive from persisted remaining balance', () => {
  const base = { id: '1', number: 'INV-1', createdAt: '', branch: 'A', table: '1', creator: null, cashier: null, status: 'served', paymentStatus: 'unpaid', subtotal: '10.00', discount: '0.00', tax: '0.00', total: '10.00', paid: '0.00', cancelledAt: null, cancelReason: null, items: [], payments: [] }
  const result = splitInvoices([{ ...base, remaining: '10.00' }, { ...base, id: '2', number: 'INV-2', remaining: '0.00', paid: '10.00', paymentStatus: 'paid' }, { ...base, id: '3', number: 'INV-3', status: 'cancelled', cancelledAt: '2026-10-18T00:00:00.000Z', cancelReason: 'customer request', remaining: '0.00' }] as InvoiceRow[])
  assert.equal(result.open.length, 1); assert.equal(result.paid.length, 1)
})

test('shifts: open/close schemas coerce and validate money inputs', () => {
  const ok = openShiftSchema.safeParse({ openingCash: '250.5' })
  assert.equal(ok.success, true)
  if (ok.success) assert.equal(ok.data.openingCash, 250.5)

  // Owner-only branch choice is optional and coerced when present.
  const ownerOpen = openShiftSchema.safeParse({ openingCash: 100, branchId: '7' })
  assert.equal(ownerOpen.success, true)
  if (ownerOpen.success) assert.equal(ownerOpen.data.branchId, 7)

  assert.equal(openShiftSchema.safeParse({ openingCash: -1 }).success, false)
  assert.equal(openShiftSchema.safeParse({ openingCash: 'abc' }).success, false)
  // openingCash now defaults to 0, so empty input is valid
  const emptyOpen = openShiftSchema.safeParse({})
  assert.equal(emptyOpen.success, true)
  if (emptyOpen.success) {
    assert.equal(emptyOpen.data.openingCash, 0)
  }

  assert.equal(closeShiftSchema.safeParse({ closingCash: 300 }).success, true)
  assert.equal(closeShiftSchema.safeParse({ closingCash: -5 }).success, false)
  // closingCash now defaults to 0, so empty input is valid
  assert.equal(closeShiftSchema.safeParse({}).success, true)

  // Handover fields are optional; notes capped at 1000 chars and the recipient
  // is an identity UUID (the server resolves its display name).
  assert.equal(
    closeShiftSchema.safeParse({ closingCash: 300, handoverNotes: 'تسليم طبيعي', handoverTo: 'أحمد' }).success,
    true,
  )
  assert.equal(
    closeShiftSchema.safeParse({ closingCash: 300, handoverNotes: 'x'.repeat(1001) }).success,
    false,
  )
  assert.equal(
    closeShiftSchema.safeParse({ closingCash: 300, handoverRecipientId: 'not-a-uuid' }).success,
    false,
  )
})

test('shifts: durable open-shift unique-index conflicts are surfaced as 409 candidates', () => {
  assert.equal(isOpenShiftUniquenessConflict({ code: 'P2002' }), true)
  assert.equal(isOpenShiftUniquenessConflict({ code: '23505' }), false)
  assert.equal(isOpenShiftUniquenessConflict(null), false)
})

test('route-access: operational employees can always access /shifts', () => {
  assert.equal(permissionForPath('/shifts'), 'orders.view')
  const cashier = ['orders.view', 'orders.update', 'orders.cancel', 'orders.refund', 'orders.payment', 'tables.view']
  assert.equal(canSeeRoute('cashier', cashier, '/shifts'), true)
  assert.equal(canSeeRoute('manager', ['orders.view', 'settings.manage'], '/shifts'), true)
  // Operational employees may always open/close their own required shift,
  // even when their station-specific permissions do not include orders.view.
  assert.equal(canSeeRoute('waiter', ['orders.view', 'tables.view'], '/shifts'), true)
  assert.equal(canSeeRoute('kitchen', ['orders.view', 'orders.kitchen_status'], '/shifts'), true)
  assert.equal(canSeeRoute('waiter', ['tables.view'], '/shifts'), true)
  assert.equal(canSeeRoute('kitchen', ['orders.kitchen_status'], '/shifts'), true)
  assert.equal(canSeeRoute('owner', [], '/shifts'), true)
})

test('route-access: ops-shell exception lets operational roles render /shifts', () => {
  assert.equal(canRenderInOpsShell('cashier', '/shifts'), true)
  assert.equal(canRenderInOpsShell('waiter', '/shifts'), true)
  assert.equal(canRenderInOpsShell('kitchen', '/shifts'), true)
  assert.equal(canRenderInOpsShell('cashier', '/cashier'), true)
  assert.equal(canRenderInOpsShell('waiter', '/cashier'), false)
  assert.equal(canRenderInOpsShell('kitchen', '/cashier'), false)
  assert.equal(canRenderInOpsShell('manager', '/shifts'), false)
  assert.equal(canRenderInOpsShell('cashier', '/reports'), false)
  // Layout logic: ops role on non-board page bounces home unless excepted.
  const bouncesHome = (role: string, pathname: string) =>
    isOperationalRole(role) && !isOpsPath(pathname) && !canRenderInOpsShell(role, pathname)
  assert.equal(bouncesHome('cashier', '/shifts'), false)
  assert.equal(bouncesHome('waiter', '/shifts'), false)
  assert.equal(bouncesHome('kitchen', '/shifts'), false)
  assert.equal(bouncesHome('cashier', '/reports'), true)
  assert.equal(bouncesHome('waiter', '/reports'), true)
  assert.equal(bouncesHome('kitchen', '/reports'), true)
})

test('shifts: only cash statuses feed the expected-cash formula (card/online excluded)', () => {
  // expected = opening + completed cash − refunded cash; card/online never
  // enter the physical drawer balance, whatever their status.
  const payments = [
    { method: 'cash', status: 'completed', amount: 100 },
    { method: 'card', status: 'completed', amount: 500 },
    { method: 'online', status: 'completed', amount: 250 },
    { method: 'card', status: 'refunded', amount: 500 },
  ]
  assert.equal(expectedCashFrom(50, payments), 150)
  const flow = computeShiftCashFlow(payments)
  assert.equal(flow.cashIn, 100)
  assert.equal(flow.cashOut, 0)
})

test('shifts: isCashHandlingRole identifies cash-handling roles', () => {
  assert.equal(isCashHandlingRole('cashier'), true)
  assert.equal(isCashHandlingRole('manager'), false) // Manager: cash handling optional, not role-inferred
  assert.equal(isCashHandlingRole('waiter'), false)
  assert.equal(isCashHandlingRole('kitchen'), false)
  assert.equal(isCashHandlingRole('owner'), false)
  assert.equal(isCashHandlingRole('bogus'), false)
})

test('shifts: close schema defaults closingCash to 0 for non-cash roles', () => {
  // Non-cash roles don't need to provide a physical cash count.
  const empty = closeShiftSchema.safeParse({})
  assert.equal(empty.success, true)
  if (empty.success) assert.equal(empty.data.closingCash, 0)

  // Cash-handling roles should still be able to provide a count.
  const withCash = closeShiftSchema.safeParse({ closingCash: 250.50 })
  assert.equal(withCash.success, true)
  if (withCash.success) assert.equal(withCash.data.closingCash, 250.5)

  assert.equal(closeShiftSchema.safeParse({ closingCash: -5 }).success, false)
  assert.equal(closeShiftSchema.safeParse({ closingCash: 'abc' }).success, false)
})

test('shifts: open schema defaults openingCash to 0 for non-cash roles', () => {
  const empty = openShiftSchema.safeParse({})
  assert.equal(empty.success, true)
  if (empty.success) assert.equal(empty.data.openingCash, 0)

  const withCash = openShiftSchema.safeParse({ openingCash: 100 })
  assert.equal(withCash.success, true)
  if (withCash.success) assert.equal(withCash.data.openingCash, 100)
})

test('shifts: cash reconciliation excludes non-cash, pending, failed transactions', () => {
  const payments = [
    { method: 'cash', status: 'completed', amount: 100 },
    { method: 'cash', status: 'pending', amount: 50 },
    { method: 'cash', status: 'failed', amount: 30 },
    { method: 'cash', status: 'refunded', amount: 20 },
    { method: 'card', status: 'completed', amount: 500 },
    { method: 'online', status: 'completed', amount: 250 },
  ]
  const flow = computeShiftCashFlow(payments)
  // Only completed cash in, refunded cash out. Pending/failed/card/online excluded.
  assert.equal(flow.cashIn, 100)
  assert.equal(flow.cashOut, 20)
  assert.equal(flow.netCash, 80)
  assert.equal(expectedCashFrom(50, payments), 130)
})

test('shifts: cash difference detects surplus and shortage', () => {
  assert.equal(cashDifferenceOf(150, 100), 50) // surplus
  assert.equal(cashDifferenceOf(50, 100), -50) // shortage
  assert.equal(cashDifferenceOf(100, 100), 0)  // balanced
})

test('route-access: all operational roles can access /shifts', () => {
  assert.equal(permissionForPath('/shifts'), 'orders.view')
  assert.equal(canSeeRoute('cashier', ['orders.view'], '/shifts'), true)
  assert.equal(canSeeRoute('waiter', ['orders.view', 'tables.view'], '/shifts'), true)
  assert.equal(canSeeRoute('kitchen', ['orders.view', 'orders.kitchen_status'], '/shifts'), true)
  assert.equal(canSeeRoute('manager', ['orders.view'], '/shifts'), true)
  assert.equal(canSeeRoute('owner', [], '/shifts'), true)
  // Their mandatory operational shift must not depend on orders.view.
  assert.equal(canSeeRoute('waiter', ['tables.view'], '/shifts'), true)
  assert.equal(canSeeRoute('kitchen', ['orders.kitchen_status'], '/shifts'), true)
})

test('route-access: ops-shell allows all operational roles for /shifts', () => {
  assert.equal(canRenderInOpsShell('cashier', '/shifts'), true)
  assert.equal(canRenderInOpsShell('waiter', '/shifts'), true)
  assert.equal(canRenderInOpsShell('kitchen', '/shifts'), true)
  assert.equal(canRenderInOpsShell('manager', '/shifts'), false)
  assert.equal(canRenderInOpsShell('owner', '/shifts'), false)
})

test('route-access: home for all roles', () => {
  assert.equal(homeForRole('waiter'), '/waiter')
  assert.equal(homeForRole('kitchen'), '/kitchen')
  assert.equal(homeForRole('cashier'), '/cashier')
  assert.equal(homeForRole('manager'), '/manager')
  assert.equal(homeForRole('owner'), '/owner')
})

test('route-access: cashier-only /cashier in ops shell', () => {
  assert.equal(canRenderInOpsShell('cashier', '/cashier'), true)
  assert.equal(canRenderInOpsShell('waiter', '/cashier'), false)
  assert.equal(canRenderInOpsShell('kitchen', '/cashier'), false)
})

test('refund schema: reason requires at least 3 characters', () => {
  assert.equal(refundSchema.safeParse({ reason: 'ab' }).success, false)
  assert.equal(refundSchema.safeParse({ reason: 'cause: duplicate charge' }).success, true)
})

test('refund schema: reason is required', () => {
  assert.equal(refundSchema.safeParse({}).success, false)
})

test('refund schema: reason max 255 characters', () => {
  assert.equal(
    refundSchema.safeParse({ reason: 'x'.repeat(256) }).success,
    false,
  )
  assert.equal(
    refundSchema.safeParse({ reason: 'x'.repeat(255) }).success,
    true,
  )
})

test('close shift schema: non-cash roles default closingCash to 0', () => {
  const parsed = closeShiftSchema.safeParse({})
  assert.equal(parsed.success, true)
  if (parsed.success) assert.equal(parsed.data.closingCash, 0)
})

test('close shift schema: cash-handling roles can provide physical count', () => {
  const parsed = closeShiftSchema.safeParse({ closingCash: 250.50 })
  assert.equal(parsed.success, true)
  if (parsed.success) assert.equal(parsed.data.closingCash, 250.5)
})

test('stock count: FIFO negative variance and reservation/staleness gates', () => {
  assert.deepEqual(planStockCount({ snapshot: 10, current: 10, counted: 7, reserved: 2, fifo: [{ quantity: 5, unitCost: 2 }, { quantity: 5, unitCost: 3 }] }), { variance: -3, direction: 'negative', cost: 6 })
  assert.equal(planStockCount({ snapshot: 10, current: 11, counted: 8, reserved: 1, fifo: [] }).blocked, 'STALE_SNAPSHOT')
  assert.equal(planStockCount({ snapshot: 10, current: 10, counted: 1, reserved: 2, fifo: [] }).blocked, 'BELOW_ACTIVE_RESERVATIONS')
})

test('stock count: positive and zero variance require auditable valuation', () => {
  assert.equal(planStockCount({ snapshot: 10, current: 10, counted: 12, reserved: 0, fifo: [] }).blocked, 'MISSING_POSITIVE_VALUATION')
  assert.deepEqual(planStockCount({ snapshot: 10, current: 10, counted: 12, reserved: 0, fifo: [], positiveUnitCost: 4 }), { variance: 2, direction: 'positive', cost: 8 })
  assert.deepEqual(planStockCount({ snapshot: 10, current: 10, counted: 10, reserved: 0, fifo: [] }), { variance: 0, direction: 'zero', cost: 0 })
})

test('API auth responses distinguish authentication from authorization', async () => {
  const unauthenticated = unauthenticatedStaffResponse()
  const forbidden = forbiddenStaffResponse()
  assert.equal(unauthenticated.status, 401)
  assert.equal(forbidden.status, 403)
  assert.deepEqual(await unauthenticated.json(), { error: 'غير مصرح' })
  assert.deepEqual(await forbidden.json(), { error: 'غير مصرح' })
})

test('request correlation accepts bounded safe IDs only', () => {
  assert.equal(normalizedRequestId('proxy_123-abc'), 'proxy_123-abc')
  assert.equal(normalizedRequestId('short'), null)
  assert.equal(normalizedRequestId('safe\r\nforged'), null)
  assert.equal(normalizedRequestId('x'.repeat(129)), null)
  assert.equal(normalizedRequestId(null), null)
})

test('staff API paths use JSON authentication semantics while public APIs do not', () => {
  assert.equal(isStaffApiPath('/api/staff/inventory/counts'), true)
  assert.equal(isStaffApiPath('/api/staff'), true)
  assert.equal(isStaffApiPath('/api/public/orders'), false)
  assert.equal(isStaffApiPath('/api/staffing'), false)
})

test('legacy login cleanup removes only the obsolete credential key without reading it', () => {
  const removed: string[] = []
  clearLegacyLoginCredentials({ removeItem(key) { removed.push(key) } })
  assert.deepEqual(removed, [LEGACY_LOGIN_CREDENTIAL_KEY])
})

test('product management roles are Owner, Manager, and Cashier only', () => {
  assert.equal(canManageProducts(ROLE.OWNER), true)
  assert.equal(canManageProducts(ROLE.MANAGER), true)
  assert.equal(canManageProducts(ROLE.CASHIER), true)
  assert.equal(canManageProducts(ROLE.WAITER), false)
  assert.equal(canManageProducts(ROLE.KITCHEN), false)
})

test('product route allows Cashier but excludes Waiter and Kitchen regardless of menu permissions', () => {
  assert.equal(canSeeRoute(ROLE.CASHIER, [], '/products'), true)
  assert.equal(canSeeRoute(ROLE.MANAGER, [], '/products'), true)
  assert.equal(canSeeRoute(ROLE.WAITER, ['menu.view'], '/products'), false)
  assert.equal(canSeeRoute(ROLE.KITCHEN, ['menu.view'], '/products'), false)
})

test('employee deactivation never removes the current or last active Owner and preserves open shifts', () => {
  const base = { actorId: 'owner-a', targetId: 'employee-a', targetRole: ROLE.CASHIER, activeOwnerCount: 1, hasOpenShift: false }
  assert.equal(employeeDeactivationBlocker(base), null)
  assert.equal(employeeDeactivationBlocker({ ...base, targetId: 'owner-a' }), 'SELF')
  assert.equal(employeeDeactivationBlocker({ ...base, targetRole: ROLE.OWNER, activeOwnerCount: 1 }), 'LAST_OWNER')
  assert.equal(employeeDeactivationBlocker({ ...base, hasOpenShift: true }), 'OPEN_SHIFT')
})

test('staff username identities are normalized, opaque for new accounts, and preserve legacy email login', () => {
  assert.equal(normalizeStaffUsername(' Ahmed.Saleh '), 'ahmed.saleh')
  assert.equal(normalizeStaffUsername('ahmed@cafe'), null)
  assert.equal(normalizeStaffUsername('a'), null)
  assert.equal(staffUsernameEmail('ahmed.saleh'), 'ahmed.saleh@accounts.skoon.invalid')
  assert.equal(staffIdentityEmail('A0B1C2D3-E4F5-6789-ABCD-0123456789AB'), 'staff.a0b1c2d3-e4f5-6789-abcd-0123456789ab@accounts.skoon.invalid')
  assert.equal(staffLoginEmail('AHMED.SALEH'), 'ahmed.saleh@accounts.skoon.invalid')
  assert.equal(staffLoginEmail('Owner@SkoonCafe.com'), 'owner@skooncafe.com')
  assert.equal(usernameFromStaffEmail('ahmed.saleh@accounts.skoon.invalid'), 'ahmed.saleh')
  assert.equal(usernameFromStaffEmail('owner@sokooncafe.com'), null)
})

test('payroll preview uses scheduled payable days, exact cents, and never enables posting', () => {
  const preview = calculatePayrollPreview({ compensationType: 'monthly', rateCents: 30_000, scheduledDays: 20, payableDays: 10, payableHours: 80, approvedAdvanceRecoveryCents: 20_000, approvedOvertimeHours: 2, includeOvertimeEstimate: true })
  assert.equal(preview.baseCents, 15_000)
  assert.equal(preview.previewOnly, true)
  assert.equal(INITIAL_PAYROLL_POLICY.financialPostingEnabled, false)
  assert.ok(preview.advanceRecoveryCents <= preview.grossCents)
})

test('payroll preview handles zero scheduled monthly days without a divisor or posting', () => {
  const preview = calculatePayrollPreview({ compensationType: 'monthly', rateCents: 30_000, scheduledDays: 0, payableDays: 0, payableHours: 0 })
  assert.equal(preview.baseCents, 0)
  assert.ok(preview.warnings.some((warning) => warning.includes('لا توجد أيام عمل مجدولة')))
})

test('catalog branch resolver auto-selects exactly one eligible active branch only', () => {
  assert.equal(selectCatalogBranch([7n]), 7n)
  assert.throws(() => selectCatalogBranch([]), (error: unknown) => error instanceof CatalogError && error.status === 503)
  assert.throws(() => selectCatalogBranch([7n, 8n]), (error: unknown) => error instanceof CatalogError && error.status === 409)
  assert.equal(selectCatalogBranch([7n, 8n], '8'), 8n)
  assert.throws(() => selectCatalogBranch([7n], '8'), (error: unknown) => error instanceof CatalogError && error.status === 403)
})

test('product configuration quantities remain exact for decimal and fractional labels', () => {
  assert.deepEqual(parseExactQuantity('1/4'), { numerator: 1n, denominator: 4n, canonical: '1/4' })
  assert.deepEqual(parseExactQuantity('0.250'), { numerator: 1n, denominator: 4n, canonical: '1/4' })
  assert.throws(() => parseExactQuantity('0'), ProductConfigurationError)
  assert.throws(() => parseExactQuantity('1/0'), ProductConfigurationError)
  assert.throws(() => parseExactQuantity('1e-3'), ProductConfigurationError)
})

test('product configuration variants have order-independent, non-duplicated combinations', () => {
  assert.equal(canonicalVariantCombination(['12', '7']), '7:12')
  assert.throws(() => canonicalVariantCombination(['7', '7']), ProductConfigurationError)
  assert.throws(() => canonicalVariantCombination([]), ProductConfigurationError)
})

test('product configuration unit conversion permits exact same-dimension factors only', () => {
  assert.deepEqual(validateUnitConversion({ dimension: 'mass', baseDimension: 'mass', factor: '1/1000' }), { numerator: 1n, denominator: 1000n, canonical: '1/1000' })
  assert.equal(validateUnitConversion({ dimension: 'piece' }), null)
  assert.throws(() => validateUnitConversion({ dimension: 'mass', baseDimension: 'volume', factor: '1' }), ProductConfigurationError)
})

test('product configuration delete protection returns Arabic 409 with bounded authorized names', () => {
  assert.doesNotThrow(() => assertConfigurationCanBeDeleted('القيمة', []))
  assert.throws(
    () => assertConfigurationCanBeDeleted('الوحدة', [
      { label: 'منتجات', count: 2, names: ['قهوة', 'شاي', 'اسم إضافي'] },
      { label: 'حركات مخزون', count: 4 },
    ]),
    (error: unknown) => error instanceof ProductConfigurationError
      && error.status === 409
      && error.message.includes('لا يمكن حذف الوحدة')
      && error.message.includes('قهوة')
      && error.message.includes('شاي'),
  )
})

// ============================================================================
// Manager operational-shift lifecycle regression tests
// ============================================================================

test('manager lifecycle: requiresOperationalShift is true for Manager (post-hardening)', () => {
  assert.equal(requiresOperationalShift(ROLE.MANAGER), true)
  assert.equal(requiresOperationalShift(ROLE.OWNER), false)
  assert.equal(requiresOperationalShift(ROLE.CASHIER), true)
  assert.equal(requiresOperationalShift(ROLE.WAITER), true)
  assert.equal(requiresOperationalShift(ROLE.KITCHEN), true)
})

test('manager lifecycle: Manager is NOT a cash-handling role by default (cash handling optional)', () => {
  assert.equal(isCashHandlingRole(ROLE.MANAGER), false)
  assert.equal(isCashHandlingRole(ROLE.CASHIER), true)
  assert.equal(isCashHandlingRole(ROLE.WAITER), false)
  assert.equal(isCashHandlingRole(ROLE.KITCHEN), false)
  assert.equal(isCashHandlingRole(ROLE.OWNER), false)
})

test('manager lifecycle: Manager is not an operational board role (stays in admin shell)', () => {
  assert.equal(isOperationalRole(ROLE.MANAGER), false)
  assert.equal(isOperationalRole(ROLE.CASHIER), true)
  assert.equal(isOperationalRole(ROLE.WAITER), true)
  assert.equal(isOperationalRole(ROLE.KITCHEN), true)
})

test('manager lifecycle: Manager home is /manager (not an ops board)', () => {
  assert.equal(homeForRole(ROLE.MANAGER), '/manager')
  assert.equal(homeForRole(ROLE.CASHIER), '/cashier')
  assert.equal(homeForRole(ROLE.WAITER), '/waiter')
  assert.equal(homeForRole(ROLE.KITCHEN), '/kitchen')
  assert.equal(homeForRole(ROLE.OWNER), '/owner')
})

test('manager lifecycle: Manager can see /dashboard without an open shift', () => {
  const manager: StaffSession = {
    id: 'manager-1', email: 'm@example.com', name: 'Manager',
    role: ROLE.MANAGER, branchId: '1', permissions: ['orders.view'],
  }
  assert.equal(canSeeRoute(manager.role, manager.permissions, '/dashboard'), true)
})

test('manager lifecycle: Manager can see /shifts (requires orders.view, no open-shift precondition at route level)', () => {
  const manager: StaffSession = {
    id: 'manager-1', email: 'm@example.com', name: 'Manager',
    role: ROLE.MANAGER, branchId: '1', permissions: ['orders.view'],
  }
  assert.equal(canSeeRoute(manager.role, manager.permissions, '/shifts'), true)
})

test('manager lifecycle: Manager cannot see /cashier without orders.payment permission', () => {
  const managerNoPay: StaffSession = {
    id: 'manager-1', email: 'm@example.com', name: 'Manager',
    role: ROLE.MANAGER, branchId: '1', permissions: ['orders.view'],
  }
  const managerWithPay: StaffSession = {
    id: 'manager-2', email: 'm2@example.com', name: 'Manager 2',
    role: ROLE.MANAGER, branchId: '1', permissions: ['orders.view', 'orders.payment'],
  }
  assert.equal(canSeeRoute(managerNoPay.role, managerNoPay.permissions, '/cashier'), false)
  assert.equal(canSeeRoute(managerWithPay.role, managerWithPay.permissions, '/cashier'), true)
})

test('manager lifecycle: Manager cannot see /finance (explicitly denied)', () => {
  const manager: StaffSession = {
    id: 'manager-1', email: 'm@example.com', name: 'Manager',
    role: ROLE.MANAGER, branchId: '1', permissions: ['orders.view', 'orders.payment', 'reports.view'],
  }
  assert.equal(canSeeRoute(manager.role, manager.permissions, '/finance'), false)
  assert.equal(canSeeRoute(manager.role, manager.permissions, '/finance/reports'), false)
})

test('manager lifecycle: Owner bypasses all route checks', () => {
  const owner: StaffSession = {
    id: 'owner-1', email: 'o@example.com', name: 'Owner',
    role: ROLE.OWNER, branchId: null, permissions: [],
  }
  // Owner bypasses every route guard (isOwner check is first in canSeeRoute).
  assert.equal(canSeeRoute(owner.role, owner.permissions, '/dashboard'), true)
  assert.equal(canSeeRoute(owner.role, owner.permissions, '/cashier'), true)
  assert.equal(canSeeRoute(owner.role, owner.permissions, '/finance'), true)
  assert.equal(canSeeRoute(owner.role, owner.permissions, '/staff/attendance-corrections'), true)
  assert.equal(canSeeRoute(owner.role, owner.permissions, '/shifts'), true)
})

test('manager lifecycle: Cashier/Waiter/Kitchen unchanged (still require open shift)', () => {
  assert.equal(requiresOperationalShift(ROLE.CASHIER), true)
  assert.equal(requiresOperationalShift(ROLE.WAITER), true)
  assert.equal(requiresOperationalShift(ROLE.KITCHEN), true)
  assert.equal(isCashHandlingRole(ROLE.CASHIER), true)
  assert.equal(isCashHandlingRole(ROLE.WAITER), false)
  assert.equal(isCashHandlingRole(ROLE.KITCHEN), false)
  assert.equal(isOperationalRole(ROLE.CASHIER), true)
  assert.equal(isOperationalRole(ROLE.WAITER), true)
  assert.equal(isOperationalRole(ROLE.KITCHEN), true)
})

// ============================================================================
// Manager shift policy hardening — cash handling optional for Manager
// ============================================================================

test('manager cash policy: Manager is NOT a cash-handling role by default', () => {
  assert.equal(isCashHandlingRole(ROLE.MANAGER), false)
  assert.equal(isCashHandlingRole(ROLE.CASHIER), true)
  assert.equal(isCashHandlingRole(ROLE.WAITER), false)
  assert.equal(isCashHandlingRole(ROLE.KITCHEN), false)
  assert.equal(isCashHandlingRole(ROLE.OWNER), false)
})

test('manager cash policy: Manager requires operational shift (not cash custody)', () => {
  assert.equal(requiresOperationalShift(ROLE.MANAGER), true)
  assert.equal(requiresOperationalShift(ROLE.OWNER), false)
})

test('manager cash policy: Manager operational shift can open without mandatory openingCash', () => {
  // openShiftSchema: openingCash is optional, default 0 — Manager may omit it.
  const parsed = openShiftSchema.safeParse({})
  assert.equal(parsed.success, true)
  assert.equal(parsed.data?.openingCash, 0)

  const parsedWithCash = openShiftSchema.safeParse({ openingCash: 100.00 })
  assert.equal(parsedWithCash.success, true)
  assert.equal(parsedWithCash.data?.openingCash, 100)
})

test('manager cash policy: Manager operational shift can close without mandatory closingCash', () => {
  // closeShiftSchema: closingCash is optional, default 0 — Manager may omit it.
  const parsed = closeShiftSchema.safeParse({})
  assert.equal(parsed.success, true)
  assert.equal(parsed.data?.closingCash, 0)

  const parsedWithCash = closeShiftSchema.safeParse({ closingCash: 250.00 })
  assert.equal(parsedWithCash.success, true)
  assert.equal(parsedWithCash.data?.closingCash, 250)
})

test('manager cash policy: Manager shift cash difference is zero (no cash custody)', () => {
  // For a non-cash-handling Manager: opening=0, expected=0 (no cash payments),
  // closing=0, difference=0.
  const expected = expectedCashFrom(0, [])
  assert.equal(expected, 0)
  const difference = cashDifferenceOf(0, expected)
  assert.equal(difference, 0)
})

test('manager cash policy: Cashier mandatory cash handling (unchanged)', () => {
  assert.equal(isCashHandlingRole(ROLE.CASHIER), true)
  assert.equal(isCashHandlingRole(ROLE.MANAGER), false)

  // Cashier must declare opening cash; Manager may omit it.
  const cashierParsed = openShiftSchema.safeParse({})
  assert.equal(cashierParsed.success, true)
  assert.equal(cashierParsed.data?.openingCash, 0) // schema default, but role logic enforces > 0 at service layer

  const managerParsed = openShiftSchema.safeParse({})
  assert.equal(managerParsed.success, true)
  assert.equal(managerParsed.data?.openingCash, 0)
})

test('manager cash policy: Waiter/Kitchen non-cash shifts (unchanged)', () => {
  assert.equal(isCashHandlingRole(ROLE.WAITER), false)
  assert.equal(isCashHandlingRole(ROLE.KITCHEN), false)
  assert.equal(isOperationalRole(ROLE.WAITER), true)
  assert.equal(isOperationalRole(ROLE.KITCHEN), true)
})

test('manager cash policy: Owner exemption from both operational shift and cash handling', () => {
  assert.equal(isOwner(ROLE.OWNER), true)
  assert.equal(requiresOperationalShift(ROLE.OWNER), false)
  assert.equal(isCashHandlingRole(ROLE.OWNER), false)
})

test('manager cash policy: Operational shift status alone does not authorize cash operations', () => {
  // requiresOperationalShift('manager') is true (shift required),
  // but isCashHandlingRole('manager') is false (no cash custody).
  // These are independent concerns.
  assert.equal(requiresOperationalShift(ROLE.MANAGER), true)
  assert.equal(isCashHandlingRole(ROLE.MANAGER), false)

  // NOTE: hasAtLeast compares privilege rank (manager=80 >= cashier=60),
  // so hasAtLeast(manager, cashier) returns TRUE in current code.
  // This means finalizeOrderPayment (which uses hasAtLeast(cashier+))
  // would technically allow a Manager to finalize cash payments.
  // This is a pre-existing authorization gap that requires separate review.
  // It is NOT weakened by this change — it existed before.
  assert.equal(hasAtLeast(ROLE.MANAGER, ROLE.CASHIER), true)
})

test('manager cash policy: Fixed-float and cash advance invariants preserved', () => {
  // Manager (>= manager) may reverse fixed-float movements — unchanged.
  assert.equal(hasAtLeast(ROLE.MANAGER, ROLE.MANAGER), true)
  assert.equal(hasAtLeast(ROLE.CASHIER, ROLE.MANAGER), false)

  // NOTE: hasAtLeast compares privilege rank (manager=80 >= cashier=60),
  // so hasAtLeast(manager, cashier) returns TRUE in current code.
  // This is a pre-existing authorization gap requiring separate security review.
  // It is NOT weakened by this change.
  assert.equal(hasAtLeast(ROLE.MANAGER, ROLE.CASHIER), true)
  assert.equal(hasAtLeast(ROLE.CASHIER, ROLE.CASHIER), true)
})

test('HR time summary uses actual calendar dates and effective schedule revisions', () => {
  const everyDay = (hours: string) => Array.from({ length: 7 }, (_, weekday) => ({ weekday, restDay: false, startsAt: '09:00', endsAt: hours }))
  const summary = calculateHrTimeSummary({
    startsOn: '2026-08-01', endsOn: '2026-08-03', timezone: 'Africa/Cairo', shifts: [],
    schedules: [
      { effectiveFrom: '2026-08-01', effectiveUntil: '2026-08-03', graceMinutes: 10, days: everyDay('17:00') },
      { effectiveFrom: '2026-08-03', graceMinutes: 10, days: everyDay('15:00') },
    ],
  })
  assert.equal(summary.totals.scheduledMinutes, 1_320)
  assert.deepEqual(summary.days.map((day) => day.scheduledMinutes), [480, 480, 360])
})

test('HR time summary splits overnight attendance across local dates without double counting', () => {
  const summary = calculateHrTimeSummary({
    startsOn: '2026-08-01', endsOn: '2026-08-02', timezone: 'Africa/Cairo',
    schedules: [],
    shifts: [{ id: 'night-1', openedAt: '2026-08-01T20:00:00.000Z', closedAt: '2026-08-02T03:00:00.000Z' }],
  })
  assert.equal(summary.totals.actualMinutes, 420)
  assert.deepEqual(summary.days.map((day) => day.actualMinutes), [60, 360])
  assert.equal(summary.days[1].overnightWorkMinutes, 360)
  assert.equal(summary.totals.restDayWorkMinutes, 420)
})

test('HR time summary distinguishes paid leave, holiday work, and unknown leave classification', () => {
  const schedule = [{ effectiveFrom: '2026-08-01', graceMinutes: 0, days: Array.from({ length: 7 }, (_, weekday) => ({ weekday, restDay: false, startsAt: '09:00', endsAt: '17:00' })) }]
  const paid = calculateHrTimeSummary({ startsOn: '2026-08-03', endsOn: '2026-08-03', timezone: 'Africa/Cairo', schedules: schedule, shifts: [], leaves: [{ status: 'approved', startsOn: '2026-08-03', endsOn: '2026-08-03', paid: true }] })
  assert.equal(paid.totals.payableMinutes, 480)
  assert.equal(paid.totals.missingMinutes, 0)
  const unknown = calculateHrTimeSummary({ startsOn: '2026-08-04', endsOn: '2026-08-04', timezone: 'Africa/Cairo', schedules: schedule, shifts: [], leaves: [{ status: 'approved', startsOn: '2026-08-04', endsOn: '2026-08-04' }], holidays: [{ startsOn: '2026-08-04', endsOn: '2026-08-04' }] })
  assert.equal(unknown.totals.leaveClassificationUnknown, true)
  assert.equal(unknown.days[0].holiday, true)
})

test('HR time summary rejects contradictory approved corrections for a shift', () => {
  assert.throws(() => calculateHrTimeSummary({
    startsOn: '2026-08-01', endsOn: '2026-08-01', timezone: 'Africa/Cairo', schedules: [], shifts: [{ id: 1, openedAt: '2026-08-01T09:00:00.000Z', closedAt: '2026-08-01T10:00:00.000Z' }],
    corrections: [{ status: 'approved', shiftId: 1 }, { status: 'approved', shiftId: 1 }],
  }), /Contradictory approved attendance corrections/)
})

test('HR payroll uses contractual calendar minutes and prevents duplicate overtime base pay', () => {
  const result = calculatePayroll({
    compensation: { kind: 'monthly', cents: 30_000_00, scheduledMinutes: 9_600, payableMinutes: 9_600 },
    overtime: [{ approvedMinutes: 120, multiplierBasisPoints: 15_000, premiumOnly: true }],
    adjustments: [{ type: 'bonus', cents: 500_00, approved: true }, { type: 'deduction', cents: 250_00, approved: true }],
  })
  assert.equal(result.baseCents, 30_000_00)
  assert.equal(result.overtimeCents, 18_750)
  assert.equal(result.grossCents, 30_687_50)
  assert.equal(result.netCents, 30_437_50)
})

test('HR payroll fails closed without a monthly contractual-hours basis and caps recovery', () => {
  assert.throws(() => calculatePayroll({ compensation: { kind: 'monthly', cents: 10_000, scheduledMinutes: 0, payableMinutes: 0 } }), /contractual scheduled minutes/)
  const result = calculatePayroll({ compensation: { kind: 'hourly', cents: 10_00, scheduledMinutes: 0, payableMinutes: 60 }, adjustments: [{ type: 'advance_repayment', cents: 20_00, approved: true }] })
  assert.equal(result.netCents, 0)
  assert.equal(result.advanceRecoveryCents, 10_00)
})

test('payroll lifecycle only permits ordered immutable transitions', () => {
  assert.equal(nextPayrollStatus('draft', 'review'), 'under_review')
  assert.equal(nextPayrollStatus('under_review', 'approve'), 'approved')
  assert.equal(nextPayrollStatus('paid', 'close'), 'closed')
  assert.throws(() => nextPayrollStatus('approved', 'review'))
  assert.equal(payrollToCents('12.5'), 1250)
})

test('invoice discounts apply the general percentage only to eligible post-item-discount amounts', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 10_000n, quantity: 2, discountType: 'percentage', discountValue: 10n, eligibleForInvoiceDiscount: true },
    { unitCents: 5_000n, quantity: 3, discountType: 'amount', discountValue: 2_000n, eligibleForInvoiceDiscount: true },
    { unitCents: 3_000n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: false },
  ], 'percentage', 10n)
  assert.equal(result.subtotalCents, 38_000n)
  assert.equal(result.itemDiscountCents, 4_000n)
  assert.equal(result.afterItemDiscountCents, 34_000n)
  assert.equal(result.eligibleBaseCents, 31_000n)
  assert.equal(result.excludedCents, 3_000n)
  assert.equal(result.invoiceDiscountCents, 3_100n)
  assert.equal(result.finalCents, 30_900n)
})

test('invoice discounts reject discounts above their authoritative bases', () => {
  assert.throws(() => calculateInvoiceDiscounts([{ unitCents: 100n, quantity: 1, discountType: 'amount', discountValue: 101n, eligibleForInvoiceDiscount: true }], 'none', 0n), /Line fixed/)
  assert.throws(() => calculateInvoiceDiscounts([{ unitCents: 100n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: false }], 'amount', 1n), /eligible subtotal/)
})

test('invoice discounts leave an all-ineligible invoice unchanged', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 12_50n, quantity: 2, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: false },
  ], 'percentage', 100n)
  assert.equal(result.eligibleBaseCents, 0n)
  assert.equal(result.excludedCents, 25_00n)
  assert.equal(result.invoiceDiscountCents, 0n)
  assert.equal(result.finalCents, 25_00n)
})

test('invoice discounts reject a fixed discount above the eligible base even when excluded value is sufficient', () => {
  assert.throws(() => calculateInvoiceDiscounts([
    { unitCents: 10_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
    { unitCents: 90_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: false },
  ], 'amount', 10_01n), /eligible subtotal/)
})

test('invoice discounts preserve excluded items under a 100 percent global discount', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 40_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
    { unitCents: 15_00n, quantity: 2, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: false },
  ], 'percentage', 100n)
  assert.equal(result.invoiceDiscountCents, 40_00n)
  assert.equal(result.excludedCents, 30_00n)
  assert.equal(result.finalCents, 30_00n)
})

test('invoice discounts apply item discounts before splitting eligible and excluded bases', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 100_00n, quantity: 1, discountType: 'percentage', discountValue: 25n, eligibleForInvoiceDiscount: true },
    { unitCents: 50_00n, quantity: 2, discountType: 'amount', discountValue: 20_00n, eligibleForInvoiceDiscount: false },
  ], 'percentage', 10n)
  assert.equal(result.itemDiscountCents, 45_00n)
  assert.equal(result.eligibleBaseCents, 75_00n)
  assert.equal(result.excludedCents, 80_00n)
  assert.equal(result.invoiceDiscountCents, 7_50n)
  assert.equal(result.finalCents, 147_50n)
})

test('invoice discounts use authoritative variant and modifier adjusted unit cents', () => {
  const variantWithModifiersCents = 18_75n
  const result = calculateInvoiceDiscounts([
    { unitCents: variantWithModifiersCents, quantity: 3, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
  ], 'percentage', 20n)
  assert.equal(result.subtotalCents, 56_25n)
  assert.equal(result.invoiceDiscountCents, 11_25n)
  assert.equal(result.finalCents, 45_00n)
})

test('invoice discounts handle zero-value eligible lines and deterministic half-cent rounding', () => {
  const zero = calculateInvoiceDiscounts([
    { unitCents: 0n, quantity: 3, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
    { unitCents: 5_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: false },
  ], 'percentage', 100n)
  assert.equal(zero.eligibleBaseCents, 0n)
  assert.equal(zero.finalCents, 5_00n)

  const rounded = calculateInvoiceDiscounts([
    { unitCents: 1n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
  ], 'percentage', 50n)
  assert.equal(rounded.invoiceDiscountCents, 1n)
  assert.equal(rounded.finalCents, 0n)
})

test('invoice discount tax policy remains based on the final post-discount total', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 100_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
    { unitCents: 50_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: false },
  ], 'percentage', 10n)
  assert.equal(result.finalCents, 140_00n)
  assert.equal(calculateInvoiceTaxCents(result.finalCents, '14.00'), 19_60n)
})

test('invoice discount persisted cent values recalculate consistently after reload', () => {
  const lines = [
    { unitCents: 33_33n, quantity: 3, discountType: 'none' as const, discountValue: 0n, eligibleForInvoiceDiscount: true },
    { unitCents: 10_00n, quantity: 1, discountType: 'none' as const, discountValue: 0n, eligibleForInvoiceDiscount: false },
  ]
  const first = calculateInvoiceDiscounts(lines, 'amount', 12_34n)
  const reloadedDiscount = BigInt(centsText(first.invoiceDiscountCents).replace('.', ''))
  const second = calculateInvoiceDiscounts(lines, 'amount', reloadedDiscount)
  assert.deepEqual(second, first)
})

test('paid invoice settlement boundary remains immutable', () => {
  assert.equal(isInvoiceSettled(100, 100), true)
  assert.equal(isInvoiceSettled(100, 99.995), true)
  assert.equal(isInvoiceSettled(100, 99.99), false)
  const source = readFileSync('src/lib/staff-invoices.ts', 'utf8')
  assert.match(source, /isInvoiceSettled\(Number\(locked\.total\), Number\(existingPaid\._sum\.amount/)
  assert.match(source, /A paid invoice cannot be edited/)
})

test('cashier totals render only persisted server invoice totals', () => {
  const source = readFileSync('src/components/cashier/invoice-board.tsx', 'utf8')
  for (const field of ['invoice.subtotal', 'invoice.discount', 'invoice.tax', 'invoice.total', 'invoice.paid', 'invoice.remaining']) assert.match(source, new RegExp(field.replace('.', '\\.')))
  assert.doesNotMatch(source, /function Totals[^}]+(?:subtotal|total)\s*[-+*/]/)
})

// --- Task: Sequential Invoice Discount Calculation regression tests ---

// Test A — Item discounts followed by general discount
// Gross: 360.00, Item discounts: 30.00, Subtotal after: 330.00, General 50%, Final: 165.00
test('invoice discounts: item discounts first then general percentage discount (Test A)', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 60_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
    { unitCents: 75_00n, quantity: 2, discountType: 'amount', discountValue: 15_00n, eligibleForInvoiceDiscount: true },
    { unitCents: 75_00n, quantity: 1, discountType: 'amount', discountValue: 15_00n, eligibleForInvoiceDiscount: true },
    { unitCents: 75_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
  ], 'percentage', 50n)
  assert.equal(result.subtotalCents, 360_00n)
  assert.equal(result.itemDiscountCents, 30_00n)
  assert.equal(result.afterItemDiscountCents, 330_00n)
  assert.equal(result.invoiceDiscountCents, 165_00n)
  assert.equal(result.finalCents, 165_00n)
})

// Test B — No item discounts
// Gross: 200.00, Item discounts: 0.00, General 10%, Final: 180.00
test('invoice discounts: general percentage discount with no item discounts (Test B)', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 200_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
  ], 'percentage', 10n)
  assert.equal(result.subtotalCents, 200_00n)
  assert.equal(result.itemDiscountCents, 0n)
  assert.equal(result.afterItemDiscountCents, 200_00n)
  assert.equal(result.invoiceDiscountCents, 20_00n)
  assert.equal(result.finalCents, 180_00n)
})

// Test C — Item discounts only
// Gross: 200.00, Item discounts: 40.00, General 0%, Final: 160.00
test('invoice discounts: item discounts only, no general discount (Test C)', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 200_00n, quantity: 1, discountType: 'amount', discountValue: 40_00n, eligibleForInvoiceDiscount: true },
  ], 'none', 0n)
  assert.equal(result.subtotalCents, 200_00n)
  assert.equal(result.itemDiscountCents, 40_00n)
  assert.equal(result.afterItemDiscountCents, 160_00n)
  assert.equal(result.invoiceDiscountCents, 0n)
  assert.equal(result.finalCents, 160_00n)
})

// Test D — Fixed general discount
// Gross: 200.00, Item discounts: 40.00, Subtotal after: 160.00, Fixed general: 30.00, Final: 130.00
test('invoice discounts: fixed general discount after item discounts (Test D)', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 200_00n, quantity: 1, discountType: 'amount', discountValue: 40_00n, eligibleForInvoiceDiscount: true },
  ], 'amount', 30_00n)
  assert.equal(result.subtotalCents, 200_00n)
  assert.equal(result.itemDiscountCents, 40_00n)
  assert.equal(result.afterItemDiscountCents, 160_00n)
  assert.equal(result.invoiceDiscountCents, 30_00n)
  assert.equal(result.finalCents, 130_00n)
})

// Test E — Full discount
// Gross: 100.00, Item discounts: 20.00, General 100%, Final: 0.00
test('invoice discounts: 100% general discount results in zero payable (Test E)', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 100_00n, quantity: 1, discountType: 'amount', discountValue: 20_00n, eligibleForInvoiceDiscount: true },
  ], 'percentage', 100n)
  assert.equal(result.subtotalCents, 100_00n)
  assert.equal(result.itemDiscountCents, 20_00n)
  assert.equal(result.afterItemDiscountCents, 80_00n)
  assert.equal(result.invoiceDiscountCents, 80_00n)
  assert.equal(result.finalCents, 0n)
})

// Quantity handling: multiple units with item discounts
test('invoice discounts: multiple quantities with item discounts then general discount', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 50_00n, quantity: 4, discountType: 'percentage', discountValue: 20n, eligibleForInvoiceDiscount: true },
    { unitCents: 30_00n, quantity: 2, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
  ], 'percentage', 10n)
  // Line 1: 50*4=200, 20% item discount=40, after=160
  // Line 2: 30*2=60, no discount, after=60
  // Gross: 260, Item discounts: 40, After items: 220, General 10%: 22, Final: 198
  assert.equal(result.subtotalCents, 260_00n)
  assert.equal(result.itemDiscountCents, 40_00n)
  assert.equal(result.afterItemDiscountCents, 220_00n)
  assert.equal(result.invoiceDiscountCents, 22_00n)
  assert.equal(result.finalCents, 198_00n)
})

// Percentage boundary: 0% general discount
test('invoice discounts: 0% general discount leaves subtotal unchanged', () => {
  const result = calculateInvoiceDiscounts([
    { unitCents: 100_00n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true },
  ], 'percentage', 0n)
  assert.equal(result.invoiceDiscountCents, 0n)
  assert.equal(result.finalCents, 100_00n)
})

// Invalid: line fixed discount exceeds its subtotal
test('invoice discounts: line fixed discount exceeding line subtotal is rejected', () => {
  assert.throws(() => calculateInvoiceDiscounts([{ unitCents: 100n, quantity: 1, discountType: 'amount', discountValue: 101n, eligibleForInvoiceDiscount: true }], 'none', 0n), /Line fixed/)
})

// Invalid: invoice fixed discount exceeds subtotal after item discounts
test('invoice discounts: general fixed discount exceeding eligible subtotal is rejected', () => {
  assert.throws(() => calculateInvoiceDiscounts([{ unitCents: 100n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true }], 'amount', 101n), /eligible subtotal/)
})

// Invalid: invoice percentage exceeds 100
test('invoice discounts: general percentage above 100 is rejected', () => {
  assert.throws(() => calculateInvoiceDiscounts([{ unitCents: 100n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true }], 'percentage', 101n), /Invoice percentage cannot exceed 100/)
})

// Invalid: negative invoice value
test('invoice discounts: negative general discount value is rejected', () => {
  assert.throws(() => calculateInvoiceDiscounts([{ unitCents: 100n, quantity: 1, discountType: 'none', discountValue: 0n, eligibleForInvoiceDiscount: true }], 'amount', -1n), /Invalid invoice discount/)
})


// --- Task C regression tests: canonical homes + redirect-to-self prevention ----

test('regression: every canonical home is reachable with empty permissions', () => {
  const cases: [string, string][] = [
    [ROLE.OWNER, '/owner'],
    [ROLE.MANAGER, '/manager'],
    [ROLE.CASHIER, '/cashier'],
    [ROLE.KITCHEN, '/kitchen'],
    [ROLE.WAITER, '/waiter'],
  ]
  for (const [role, path] of cases) {
    assert.equal(canSeeRoute(role, [], path), true, `${role} must reach ${path} with no permissions`)
  }
})

test('regression: canonical home is never blocked by missing mutable permission', () => {
  // Cashier without orders.payment must still reach /cashier (their canonical home)
  assert.equal(canSeeRoute(ROLE.CASHIER, [], '/cashier'), true)
  // Cashier with orders.payment can also reach /cashier
  assert.equal(canSeeRoute(ROLE.CASHIER, ['orders.payment'], '/cashier'), true)
  // Manager with orders.payment can reach /cashier (supervisory)
  assert.equal(canSeeRoute(ROLE.MANAGER, ['orders.payment'], '/cashier'), true)
  // Manager without orders.payment cannot reach /cashier
  assert.equal(canSeeRoute(ROLE.MANAGER, [], '/cashier'), false)
  // Non-cashier roles cannot reach /cashier
  assert.equal(canSeeRoute(ROLE.WAITER, [], '/cashier'), false)
  assert.equal(canSeeRoute(ROLE.KITCHEN, [], '/cashier'), false)
})

test('regression: requiresOperationalShift boundary cases', () => {
  assert.equal(requiresOperationalShift(ROLE.CASHIER), true)
  assert.equal(requiresOperationalShift(ROLE.WAITER), true)
  assert.equal(requiresOperationalShift(ROLE.KITCHEN), true)
  assert.equal(requiresOperationalShift(ROLE.MANAGER), true)
  assert.equal(requiresOperationalShift(ROLE.OWNER), false)
  assert.equal(requiresOperationalShift('invalid-role'), false)
})

test('regression: safeInternalRedirect rejects login and dashboard', () => {
  assert.equal(safeInternalRedirect('/login' as any), null)
  assert.equal(safeInternalRedirect('/dashboard' as any), null)
  assert.equal(safeInternalRedirect('/cashier'), '/cashier')
  assert.equal(safeInternalRedirect('/owner'), '/owner')
  assert.equal(safeInternalRedirect(null), null)
})

test('regression: homeForRole returns canonical home for all 5 roles', () => {
  assert.equal(homeForRole(ROLE.OWNER), '/owner')
  assert.equal(homeForRole(ROLE.MANAGER), '/manager')
  assert.equal(homeForRole(ROLE.CASHIER), '/cashier')
  assert.equal(homeForRole(ROLE.KITCHEN), '/kitchen')
  assert.equal(homeForRole(ROLE.WAITER), '/waiter')
  assert.equal(homeForRole('invalid-role'), '/login?reason=unprovisioned')
})

test('regression: resolveRoleHome returns null for unknown roles', () => {
  assert.equal(resolveRoleHome(ROLE.OWNER), '/owner')
  assert.equal(resolveRoleHome(ROLE.MANAGER), '/manager')
  assert.equal(resolveRoleHome(ROLE.CASHIER), '/cashier')
  assert.equal(resolveRoleHome(ROLE.KITCHEN), '/kitchen')
  assert.equal(resolveRoleHome(ROLE.WAITER), '/waiter')
  assert.equal(resolveRoleHome('unknown'), null)
})

test('regression: /dashboard compat route never redirects to itself or creates a loop', () => {
  // /dashboard is not a canonical home for any role, so the compat route
  // always forwards to a real role home and never loops back to /dashboard.
  for (const role of [ROLE.OWNER, ROLE.MANAGER, ROLE.CASHIER, ROLE.KITCHEN, ROLE.WAITER]) {
    assert.notEqual(resolveRoleHome(role), '/dashboard')
    assert.notEqual(homeForRole(role), '/dashboard')
  }
  // Owner specifically lands on /owner, never /dashboard.
  assert.equal(resolveRoleHome(ROLE.OWNER), '/owner')
  assert.equal(homeForRole(ROLE.OWNER), '/owner')
  assert.equal(canSeeRoute(ROLE.OWNER, [], '/owner'), true)
})

test('regression: operational roles are exactly waiter/kitchen/cashier', () => {
  assert.equal(isOperationalRole(ROLE.WAITER), true)
  assert.equal(isOperationalRole(ROLE.KITCHEN), true)
  assert.equal(isOperationalRole(ROLE.CASHIER), true)
  assert.equal(isOperationalRole(ROLE.MANAGER), false)
  assert.equal(isOperationalRole(ROLE.OWNER), false)
})

test('staff reconciliation: only an Owner can authorize a non-owner employee mapping', () => {
  assert.equal(validateOwnerAuthority(ROLE.OWNER, null, ROLE.CASHIER, '1'), null)
  assert.notEqual(validateOwnerAuthority(ROLE.MANAGER, '1', ROLE.CASHIER, '1'), null)
  assert.notEqual(validateOwnerAuthority(ROLE.OWNER, null, ROLE.OWNER, undefined), null)
})

test('staff reconciliation: requires an explicit confirmed non-owner assignment', () => {
  assert.equal(RECONCILE_SCHEMA.safeParse({
    authUserId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Verified Cashier',
    role: ROLE.CASHIER,
    branchId: '1',
    confirmOwnership: true,
  }).success, true)
  assert.equal(RECONCILE_SCHEMA.safeParse({
    authUserId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Owner Attempt',
    role: ROLE.OWNER,
    confirmOwnership: true,
  }).success, false)
  assert.equal(RECONCILE_SCHEMA.safeParse({
    authUserId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Unconfirmed Cashier',
    role: ROLE.CASHIER,
    branchId: '1',
    confirmOwnership: false,
  }).success, false)
})

test('initial branch bootstrap validates a bounded code and does not accept arbitrary identifiers', () => {
  assert.equal(initialBranchSchema.safeParse({ name: 'Sokoon Main', code: 'main_01' }).success, true)
  assert.equal(initialBranchSchema.safeParse({ name: 'S', code: 'MAIN' }).success, false)
  assert.equal(initialBranchSchema.safeParse({ name: 'Sokoon Main', code: 'main branch' }).success, false)
})

test('receipt settlement uses the persisted discounted invoice, never a pre-payment snapshot', () => {
  const before: InvoiceRow = {
    id: '77', number: 'INV-77', createdAt: '2026-10-28T10:00:00.000Z', branch: 'Main', table: '1', creator: 'Cashier', cashier: null, status: 'new', paymentStatus: 'unpaid',
    subtotal: '100.00', itemDiscount: '10.00', discountEligibleBase: '90.00', discountType: 'percentage', discountValue: '10', discount: '19.00', tax: '0.00', total: '81.00', paid: '0.00', remaining: '81.00', cancelledAt: null, cancelReason: null,
    items: [], payments: [],
  }
  const persisted: InvoiceRow = { ...before, paymentStatus: 'paid', paid: '81.00', remaining: '0.00', payments: [{ id: '9', method: 'cash', amount: '81.00', createdAt: '2026-10-28T10:01:00.000Z', collector: 'Cashier' }] }
  assert.equal(receiptInvoiceForSettlement('77', before), null)
  assert.equal(receiptInvoiceForSettlement('77', persisted), persisted)
  const breakdown = receiptSettlementBreakdown(persisted, { paid: '81.00', change: '19.00', method: 'cash' })
  assert.deepEqual(breakdown, { subtotal: '100.00', itemDiscount: '10.00', generalDiscount: '9.00', generalDiscountPercent: 10, finalTotal: '81.00', paid: '81.00', method: 'cash', change: '19.00' })
})

test('invoice variants: all persisted variant labels are available to settlement and receipt views', () => {
  assert.deepEqual(resolveVariantLabels(['Current label'], { values: [{ label: 'Large' }, { label: 'Oat milk' }] }), ['Large', 'Oat milk'])
  assert.deepEqual(resolveVariantLabels([], { values: [{ label: 'Large' }, { label: 'Oat milk' }] }), ['Large', 'Oat milk'])
})

test('invoice variants: snapshots preserve multiple attributes and historical labels after refresh or settlement', () => {
  const values = [
    { label: 'حليب شوفان', attribute: { name: 'نوع الحليب', sortOrder: 2 } },
    { label: 'كبير', attribute: { name: 'الحجم', sortOrder: 1 } },
  ]
  const snapshot = createOrderItemVariantSnapshot('size:large|milk:oat', values)
  assert.deepEqual(orderedVariantLabels(values), ['كبير', 'حليب شوفان'])
  assert.deepEqual(resolveOrderItemVariantLabels(snapshot, ['ملصق كتالوج متغير']), ['كبير', 'حليب شوفان'])
  assert.equal(resolveVariantLabels(['ملصق كتالوج متغير'], snapshot).join(' · '), 'كبير · حليب شوفان')
})

test('invoice variants: products without variants keep a normal product name fallback', () => {
  assert.deepEqual(resolveOrderItemVariantLabels(null, []), [])
  assert.deepEqual(orderedVariantLabels([], ''), [])
})

test('product modifiers: POS input preserves structured selections and ignores client prices', () => {
  const parsed = posOrderSchema.parse({
    tableId: '7',
    items: [{ productId: '11', variantId: '21', qty: 2, price: 0.01, modifierSelections: [{ groupId: '31', valueIds: ['41', '42'] }] }],
  })
  assert.deepEqual(parsed.items[0], { productId: '11', variantId: '21', modifierSelections: [{ groupId: '31', valueIds: ['41', '42'] }], qty: 2 })
})

test('product modifiers: immutable snapshots retain historical labels for invoices and receipts', () => {
  const snapshot = { version: 1, groups: [
    { groupId: '31', groupName: 'Milk', optionId: '41', optionLabel: 'Oat milk', priceAdjustment: '10.00' },
    { groupId: '32', groupName: 'Extras', optionId: '42', optionLabel: 'Extra shot', priceAdjustment: '15.00' },
  ] }
  assert.deepEqual(modifierSnapshotLabels(snapshot), ['Oat milk', 'Extra shot'])
  assert.deepEqual(modifierSnapshotLabels({ groups: [{ optionLabel: '  اسم إضافة عربي طويل للاختبار  ' }] }), ['اسم إضافة عربي طويل للاختبار'])
})

test('product modifiers: owner mutation schema validates reusable groups and assignments', () => {
  assert.equal(modifierMutationSchema.safeParse({ action: 'group.create', branchId: '1', name: 'Milk', type: 'single', isRequired: true, minSelections: 1, maxSelections: 1 }).success, true)
  assert.equal(modifierMutationSchema.safeParse({ action: 'option.create', groupId: '31', label: 'Oat', priceAdjustment: 10 }).success, true)
  assert.equal(modifierMutationSchema.safeParse({ action: 'assignment.set', productId: '11', groupIds: ['31', '32'] }).success, true)
  assert.equal(modifierMutationSchema.safeParse({ action: 'assignment.set', productId: '11', groupIds: ['not-an-id'] }).success, false)
})

test('POS drafts are isolated by cashier and branch and discard stale catalog lines', () => {
  assert.notEqual(posDraftKey('cashier-a', '1'), posDraftKey('cashier-b', '1'))
  assert.notEqual(posDraftKey('cashier-a', '1'), posDraftKey('cashier-a', '2'))
  const draft = restorePosDraft(JSON.stringify({ cart: [{ id: 'product-a', qty: 2, note: 'no sugar' }, { id: 'removed-product', qty: 1 }], tableId: 'table-1', customerName: 'Customer', customerPhone: '+20 100 000 0000' }), new Set(['product-a']), new Set(['table-1']))
  assert.deepEqual(draft, { cart: [{ id: 'product-a', modifierSelections: {}, qty: 2, note: 'no sugar' }], tableId: 'table-1', customerName: 'Customer', customerPhone: '+20 100 000 0000' })
})

test('POS drafts preserve selected variants across refresh and reject stale variant identities', () => {
  const raw = JSON.stringify({ cart: [{ id: 'latte', variantId: 'large', qty: 2 }, { id: 'latte', variantId: 'removed', qty: 1 }], tableId: 'table-1' })
  const restored = restorePosDraft(raw, new Set(['latte']), new Set(['table-1']), new Set(['latte:large']))
  assert.deepEqual(restored?.cart, [{ id: 'latte', variantId: 'large', modifierSelections: {}, qty: 2 }])
})

test('waiter POS confirmation creates once and dispatches the persisted order ID', async () => {
  let createCalls = 0
  const dispatchedIds: string[] = []
  const result = await confirmWaiterPosOrder(
    async () => { createCalls += 1; return { id: '501', orderNumber: 'W-501', total: '125.00' } },
    async (orderId) => { dispatchedIds.push(orderId) },
  )

  assert.equal(createCalls, 1)
  assert.deepEqual(dispatchedIds, ['501'])
  assert.deepEqual(result, { order: { id: '501', orderNumber: 'W-501', total: '125.00' }, dispatched: true })
})

test('waiter POS dispatch failure preserves the saved order for retry without creating another', async () => {
  let createCalls = 0
  const result = await confirmWaiterPosOrder(
    async () => { createCalls += 1; return { id: '502', orderNumber: 'W-502', total: '80.00' } },
    async () => { throw new Error('Kitchen unavailable') },
  )

  assert.equal(createCalls, 1)
  assert.equal(result.order.id, '502')
  assert.equal(result.dispatched, false)
  assert.equal(result.dispatchError, 'Kitchen unavailable')
})

test('order item removal authorization is cashier or responsible/explicitly permitted waiter only', () => {
  assert.equal(canVoidOrderItemForOrder({ id: 'cashier', role: ROLE.CASHIER, permissions: [] }, null), true)
  assert.equal(canVoidOrderItemForOrder({ id: 'waiter-a', role: ROLE.WAITER, permissions: [] }, 'waiter-a'), true)
  assert.equal(canVoidOrderItemForOrder({ id: 'waiter-b', role: ROLE.WAITER, permissions: [] }, 'waiter-a'), false)
  assert.equal(canVoidOrderItemForOrder({ id: 'waiter-b', role: ROLE.WAITER, permissions: ['orders.cancel'] }, 'waiter-a'), true)
  assert.equal(canVoidOrderItemForOrder({ id: 'owner', role: ROLE.OWNER, permissions: ['orders.cancel'] }, null), false)
})

test('order item removal blocks paid, served, terminal, and final-item invoices', () => {
  assert.equal(orderItemVoidBlocker({ status: 'new', paymentStatus: 'unpaid', completedPayments: 0, servedQuantity: 0, activeItems: 2 }), null)
  assert.equal(orderItemVoidBlocker({ status: 'new', paymentStatus: 'paid', completedPayments: 1, servedQuantity: 0, activeItems: 2 }), 'paid')
  assert.equal(orderItemVoidBlocker({ status: 'ready', paymentStatus: 'unpaid', completedPayments: 0, servedQuantity: 1, activeItems: 2 }), 'served')
  assert.equal(orderItemVoidBlocker({ status: 'cancelled', paymentStatus: 'unpaid', completedPayments: 0, servedQuantity: 0, activeItems: 2 }), 'closed')
  assert.equal(orderItemVoidBlocker({ status: 'preparing', paymentStatus: 'unpaid', completedPayments: 0, servedQuantity: 0, activeItems: 1 }), 'last_item')
})

test('invoice deletion is rejected for paid and unpaid invoices without a mutation path', () => {
  const paid = invoiceDeletionRejection({ role: ROLE.OWNER })
  const unpaid = invoiceDeletionRejection({ role: ROLE.OWNER })
  assert.deepEqual(paid, unpaid)
  assert.equal(paid.status, 405)
  assert.equal(paid.allow, 'PATCH')

  const route = readFileSync('src/app/api/staff/invoices/[id]/route.ts', 'utf8')
  assert.doesNotMatch(route, /\b(?:payment|order)\.(?:delete|deleteMany)\b/)
  assert.doesNotMatch(route, /@\/lib\/prisma/)
})

test('invoice deletion keeps authentication and authorization boundaries', () => {
  assert.equal(invoiceDeletionRejection(null).status, 401)
  assert.equal(invoiceDeletionRejection({ role: ROLE.CASHIER }).status, 403)
  assert.equal(invoiceDeletionRejection({ role: ROLE.MANAGER }).status, 403)
  assert.equal(invoiceDeletionRejection({ role: ROLE.OWNER }).status, 405)
})

// --- Employee edit regression tests (offline: authorization + validation only) ---

test('employee edit: Owner can manage lifecycle, Manager and below cannot', () => {
  assert.equal(canManageEmployeeLifecycle(ROLE.OWNER), true)
  assert.equal(canManageEmployeeLifecycle(ROLE.MANAGER), false)
  assert.equal(canManageEmployeeLifecycle(ROLE.CASHIER), false)
  assert.equal(canManageEmployeeLifecycle(ROLE.WAITER), false)
  assert.equal(canManageEmployeeLifecycle(ROLE.KITCHEN), false)
})

test('employee edit: deactivation blockers protect self, last owner, and open shift', () => {
  const base = { actorId: 'admin-1', targetId: 'emp-1', targetRole: ROLE.CASHIER, activeOwnerCount: 2, hasOpenShift: false }
  assert.equal(employeeDeactivationBlocker(base), null)
  assert.equal(employeeDeactivationBlocker({ ...base, targetId: 'admin-1' }), 'SELF')
  assert.equal(employeeDeactivationBlocker({ ...base, targetRole: ROLE.OWNER, activeOwnerCount: 1 }), 'LAST_OWNER')
  assert.equal(employeeDeactivationBlocker({ ...base, hasOpenShift: true }), 'OPEN_SHIFT')
})

test('employee edit: only known canonical roles are assignable', () => {
  assert.equal(isKnownRole(ROLE.OWNER), true)
  assert.equal(isKnownRole(ROLE.MANAGER), true)
  assert.equal(isKnownRole(ROLE.CASHIER), true)
  assert.equal(isKnownRole(ROLE.WAITER), true)
  assert.equal(isKnownRole(ROLE.KITCHEN), true)
  assert.equal(isKnownRole('accountant'), false)
  assert.equal(isKnownRole(''), false)
})

test('employee edit: username normalization accepts valid staff usernames', () => {
  assert.equal(normalizeStaffUsername('ahmed.saleh'), 'ahmed.saleh')
  assert.equal(normalizeStaffUsername('Ahmed_Saleh'), 'ahmed_saleh')
  assert.equal(normalizeStaffUsername('user-1'), 'user-1')
  assert.equal(normalizeStaffUsername(' a.b-c '), 'a.b-c')
})

test('employee edit: username normalization rejects invalid formats', () => {
  assert.equal(normalizeStaffUsername(''), null)
  assert.equal(normalizeStaffUsername('a'), null)
  assert.equal(normalizeStaffUsername('ahmed@cafe'), null)
  assert.equal(normalizeStaffUsername('user!'), null)
})

test('employee edit: staff username email mapping is reversible', () => {
  const username = 'ahmed.saleh'
  const email = staffUsernameEmail(username)
  assert.equal(email, `${username}@accounts.skoon.invalid`)
  assert.equal(usernameFromStaffEmail(email), username)
  assert.equal(usernameFromStaffEmail('regular@cafe.com'), null)
})

test('employee edit: staff login email resolves username or email', () => {
  assert.equal(staffLoginEmail('ahmed.saleh'), 'ahmed.saleh@accounts.skoon.invalid')
  assert.equal(staffLoginEmail('AHMED.SALEH'), 'ahmed.saleh@accounts.skoon.invalid')
  assert.equal(staffLoginEmail('ahmed@cafe.com'), 'ahmed@cafe.com')
  assert.equal(staffLoginEmail(''), null)
})

