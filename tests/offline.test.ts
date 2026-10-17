/**
 * Offline unit tests — NO database, NO network, NO external services.
 * Run with:  node --import tsx --test tests/offline.test.ts
 *
 * Covers: public env validation, authorization helpers, and the secure POS PIN
 * storage/verification design (real bcrypt hash/verify round-trip).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getPublicEnv } from '../src/lib/env'
import {
  ROLE,
  isKnownRole,
  hasAtLeast,
  isOwner,
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
import { PAYMENT_METHODS } from '../src/lib/staff-payments-write'
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
  openShiftSchema,
} from '../src/lib/staff-shifts'
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

// --- Route-access matrix: every role → what they may open ------------------

test('route-access: owner sees every mapped page', () => {
  for (const path of ['/orders', '/pos', '/kitchen', '/waiter', '/tables', '/products', '/inventory', '/customers', '/staff', '/reports', '/settings', '/shifts']) {
    assert.equal(canSeeRoute('owner', [], path), true, `owner must open ${path}`)
  }
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

test('route-access: cashier sees POS + orders, not menu/staff', () => {
  const perms = ['orders.view', 'orders.update', 'orders.cancel', 'orders.refund', 'orders.payment', 'tables.view']
  assert.equal(canSeeRoute('cashier', perms, '/pos'), true)
  assert.equal(canSeeRoute('cashier', perms, '/orders'), true)
  assert.equal(canSeeRoute('cashier', perms, '/products'), false)
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
  assert.equal(homeForRole('cashier'), '/pos')
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

test('route-access: ops boards are the three full-screen paths', () => {
  assert.equal(isOpsPath('/pos'), true)
  assert.equal(isOpsPath('/kitchen'), true)
  assert.equal(isOpsPath('/waiter'), true)
  assert.equal(isOpsPath('/dashboard'), false)
  assert.equal(isOpsPath('/orders'), false)
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
  assert.equal(openShiftSchema.safeParse({}).success, false)

  assert.equal(closeShiftSchema.safeParse({ closingCash: 300 }).success, true)
  assert.equal(closeShiftSchema.safeParse({ closingCash: -5 }).success, false)
})

test('route-access: /shifts requires orders.payment (cashier+, not waiter/kitchen)', () => {
  assert.equal(permissionForPath('/shifts'), 'orders.payment')
  const cashier = ['orders.view', 'orders.update', 'orders.cancel', 'orders.refund', 'orders.payment', 'tables.view']
  assert.equal(canSeeRoute('cashier', cashier, '/shifts'), true)
  assert.equal(canSeeRoute('manager', ['orders.payment', 'settings.manage'], '/shifts'), true)
  // settings.manage alone no longer opens /shifts (cashiers can't manage settings
  // but MUST open a till to collect money).
  assert.equal(canSeeRoute('manager', ['settings.manage'], '/shifts'), false)
  assert.equal(canSeeRoute('waiter', ['orders.view', 'tables.view'], '/shifts'), false)
  assert.equal(canSeeRoute('kitchen', ['orders.kitchen_status'], '/shifts'), false)
  assert.equal(canSeeRoute('owner', [], '/shifts'), true)
})

test('route-access: ops-shell exception lets only the cashier render /shifts', () => {
  assert.equal(canRenderInOpsShell('cashier', '/shifts'), true)
  assert.equal(canRenderInOpsShell('waiter', '/shifts'), false)
  assert.equal(canRenderInOpsShell('kitchen', '/shifts'), false)
  assert.equal(canRenderInOpsShell('manager', '/shifts'), false)
  assert.equal(canRenderInOpsShell('cashier', '/reports'), false)
  // Layout logic: ops role on non-board page bounces home unless excepted.
  const bouncesHome = (role: string, pathname: string) =>
    isOperationalRole(role) && !isOpsPath(pathname) && !canRenderInOpsShell(role, pathname)
  assert.equal(bouncesHome('cashier', '/shifts'), false)
  assert.equal(bouncesHome('cashier', '/reports'), true)
  assert.equal(bouncesHome('waiter', '/shifts'), true)
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
