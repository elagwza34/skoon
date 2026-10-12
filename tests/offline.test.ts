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
import { getGuestOrders, saveGuestOrder } from '../src/lib/guest-orders'
import { SETTING_DEFS, SettingsError } from '../src/lib/staff-settings-write'
import {
  homeForRole,
  isOperationalRole,
  isOpsPath,
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
