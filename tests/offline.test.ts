/**
 * Offline unit tests — NO database, NO network, NO external services.
 * Run with:  node --import tsx --test tests/offline.test.ts
 *
 * Covers: public env validation, authorization helpers, and the secure POS PIN
 * storage/verification design (real bcrypt hash/verify round-trip).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planStockCount } from '../src/lib/stock-count-policy'

import { getPublicEnv } from '../src/lib/env'
import { unauthenticatedStaffResponse, forbiddenStaffResponse, isStaffApiPath } from '../src/lib/api-auth-response'
import { normalizedRequestId } from '../src/lib/request-correlation'
import { clearLegacyLoginCredentials, LEGACY_LOGIN_CREDENTIAL_KEY } from '../src/lib/auth/login-storage'
import { safeInternalRedirect } from '../src/lib/auth/safe-redirect'
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
import { PAYMENT_METHODS, refundSchema } from '../src/lib/staff-payments-write'
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
  openShiftSchema,
} from '../src/lib/staff-shifts'
import { floatMovementSchema } from '../src/lib/staff-float'
import { recalculateInvoiceTotals, splitInvoices, type InvoiceRow } from '../src/lib/staff-invoices'
import { posOrderSchema } from '../src/lib/staff-pos'
import { isKitchenTicketVisible, itemPreparationState, OrderError, transitionOrderStatus } from '../src/lib/staff-orders'
import { canTransitionOrder } from '../src/lib/staff-orders'
import { canViewOwnerWaiterMonitor, isWaiterTableOrderActive } from '../src/lib/staff-waiter'
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
  permissionForPath,
  canSeeRoute,
} from '../src/lib/route-access'
import { canManageEmployeeLifecycle, canReadEmployeeDirectory, canReadSensitiveEmployeeData, canResetEmployeePassword, employeeDeactivationBlocker } from '../src/lib/hr-authz'
import { canManageProducts, CatalogError, targetBranch } from '../src/lib/staff-catalog-write'
import { selectCatalogBranch } from '../src/lib/catalog-branch'
import { effectivePeriodsOverlap, evaluateAttendance, validateWeeklySchedule } from '../src/lib/hr-scheduling-policy'
import { classifyUnassignedWaiterOrder } from '../src/lib/waiter-readiness-policy'
import {
  approvalExecutesOrderMutation,
  canReviewLegacyResponsibility,
  canTransitionReconciliationReview,
  isLegacySnapshotCurrent,
  validateLegacyReconciliationProposal,
} from '../src/lib/waiter-reconciliation-policy'

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
test('route-access: home per role routes operational staff to their board', () => {
  assert.equal(homeForRole('waiter'), '/waiter')
  assert.equal(homeForRole('kitchen'), '/kitchen')
  assert.equal(homeForRole('cashier'), '/cashier')
  assert.equal(homeForRole('owner'), '/dashboard')
  assert.equal(homeForRole('manager'), '/dashboard')
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

test('route-access: /cashier requires orders.payment (cashier+ only)', () => {
  assert.equal(permissionForPath('/cashier'), 'orders.payment')
  const cashier = ['orders.view', 'orders.update', 'orders.cancel', 'orders.refund', 'orders.payment', 'tables.view']
  assert.equal(canSeeRoute('cashier', cashier, '/cashier'), true)
  assert.equal(canSeeRoute('manager', ['orders.payment', 'settings.manage'], '/cashier'), true)
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

test('authz: operational shift policy exempts Owner and Manager only', () => {
  assert.equal(requiresOperationalShift(ROLE.OWNER), false)
  assert.equal(requiresOperationalShift(ROLE.MANAGER), false)
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
test('payments: PAYMENT_METHODS are the three supported methods', () => {
  assert.deepEqual([...PAYMENT_METHODS], ['cash', 'card', 'online'])
  // V1 rule: no partial payments, so methods stay minimal and server-priced.
  assert.equal(PAYMENT_METHODS.length, 3)
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

test('pos order input contains only item identity, quantity, table, and customer data', () => {
  const parsed = posOrderSchema.parse({ tableId: '7', customerName: 'Guest', total: 0.01, items: [{ productId: '11', qty: 2, price: 0.01 }] })
  assert.deepEqual(parsed, { tableId: '7', customerName: 'Guest', items: [{ productId: '11', qty: 2 }] })
  assert.equal(posOrderSchema.safeParse({ tableId: '7', items: [] }).success, false)
  assert.equal(posOrderSchema.safeParse({ tableId: '7', items: [{ productId: '11', qty: 21 }] }).success, false)
})

test('invoices: open and paid sections derive from persisted remaining balance', () => {
  const base = { id: '1', number: 'INV-1', createdAt: '', branch: 'A', table: '1', creator: null, status: 'served', paymentStatus: 'unpaid', subtotal: '10.00', discount: '0.00', tax: '0.00', total: '10.00', paid: '0.00', cancelledAt: null, cancelReason: null, items: [], payments: [] }
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

test('route-access: /shifts requires orders.view (all operational roles)', () => {
  assert.equal(permissionForPath('/shifts'), 'orders.view')
  const cashier = ['orders.view', 'orders.update', 'orders.cancel', 'orders.refund', 'orders.payment', 'tables.view']
  assert.equal(canSeeRoute('cashier', cashier, '/shifts'), true)
  assert.equal(canSeeRoute('manager', ['orders.view', 'settings.manage'], '/shifts'), true)
  // Waiter and kitchen have orders.view → can open /shifts for their own shift
  assert.equal(canSeeRoute('waiter', ['orders.view', 'tables.view'], '/shifts'), true)
  assert.equal(canSeeRoute('kitchen', ['orders.view', 'orders.kitchen_status'], '/shifts'), true)
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
  assert.equal(isCashHandlingRole('manager'), true)
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
  // Without orders.view, cannot access /shifts
  assert.equal(canSeeRoute('waiter', ['tables.view'], '/shifts'), false)
  assert.equal(canSeeRoute('kitchen', ['orders.kitchen_status'], '/shifts'), false)
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
  assert.equal(homeForRole('manager'), '/dashboard')
  assert.equal(homeForRole('owner'), '/dashboard')
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

test('catalog branch resolver auto-selects exactly one eligible active branch only', () => {
  assert.equal(selectCatalogBranch([7n]), 7n)
  assert.throws(() => selectCatalogBranch([]), (error: unknown) => error instanceof CatalogError && error.status === 503)
  assert.throws(() => selectCatalogBranch([7n, 8n]), (error: unknown) => error instanceof CatalogError && error.status === 409)
  assert.equal(selectCatalogBranch([7n, 8n], '8'), 8n)
  assert.throws(() => selectCatalogBranch([7n], '8'), (error: unknown) => error instanceof CatalogError && error.status === 403)
})
