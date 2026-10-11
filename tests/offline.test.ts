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
  SETTING_DEFS,
  SettingsError,
} from '../src/lib/staff-settings-write'
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
