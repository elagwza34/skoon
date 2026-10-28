/** Offline regression tests for staff provisioning (src/lib/staff-provision-write.ts).
 * NO database, NO network, NO external services.
 * Mocks Supabase Auth admin and Prisma at the object level.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROLE } from '../src/lib/authz'
import type { StaffSession } from '../src/lib/session'

// Install mock prisma on globalThis BEFORE importing staff-provision-write,
// so the prisma Proxy delegates to our mock instead of a real PrismaClient.
(globalThis as any).prisma = {
  user: {
    findFirst: async (): Promise<unknown> => null,
    findUnique: async (): Promise<unknown> => null,
    create: async ({ data }: { data: { id: string; name: string; email: string; branchId: string | null } }): Promise<{ id: string; name: string; email: string; branchId: string | null }> => data,
    count: async (): Promise<number> => 0,
  },
  role: {
    findUnique: async ({ where }: { where: { slug: string } }): Promise<{ id: bigint; slug: string } | null> => {
      if (where.slug === 'owner') return { id: 2n, slug: 'owner' }
      if (where.slug === 'waiter') return { id: 1n, slug: 'waiter' }
      return null
    },
  },
  cafeBranch: {
    findFirst: async ({ where }: { where: { id: bigint; isActive: boolean } }): Promise<{ id: bigint; isActive: boolean } | null> => {
      if (where.id === 1n && where.isActive) return { id: 1n, isActive: true }
      return null
    },
  },
  employeeProfile: {
    create: async (): Promise<{ id: bigint }> => ({ id: 1n }),
  },
  auditLog: {
    create: async (): Promise<{ id: bigint }> => ({ id: 1n }),
  },
  $transaction: async (callback: (tx: any) => Promise<any>): Promise<any> => {
    const prismaAny = (globalThis as any).prisma
    const tx = {
      user: { create: prismaAny.user.create, findFirst: prismaAny.user.findFirst, findUnique: prismaAny.user.findUnique, count: prismaAny.user.count },
      role: { findUnique: prismaAny.role.findUnique },
      cafeBranch: { findFirst: prismaAny.cafeBranch.findFirst },
      employeeProfile: { create: prismaAny.employeeProfile.create },
      auditLog: { create: prismaAny.auditLog.create },
    }
    return callback(tx)
  },
}

let mockPrisma: any

function makeOwnerSession(): StaffSession {
  return { id: 'owner-uuid-000000000001', email: 'owner@branch.test', name: 'Test Owner', role: ROLE.OWNER, branchId: null, permissions: [] }
}

function makeWaiterSession(): StaffSession {
  return { id: 'waiter-uuid-000000000002', email: 'waiter@branch.test', name: 'Test Waiter', role: ROLE.WAITER, branchId: '1', permissions: [] }
}

function makeMockPrisma(overrides: any = {}): any {
  const roleRow = { id: 1n, slug: ROLE.WAITER }
  const ownerRoleRow = { id: 2n, slug: ROLE.OWNER }
  const branchRow = { id: 1n, isActive: true }
  const base = {
    user: { findFirst: async () => null, findUnique: async () => null, create: async ({ data }: { data: any }) => ({ id: data.id, name: data.name, email: data.email, branchId: data.branchId }) },
    role: { findUnique: async ({ where }: { where: { slug: string } }) => { if (where.slug === ROLE.OWNER) return ownerRoleRow; if (where.slug === ROLE.WAITER) return roleRow; return null } },
    cafeBranch: { findFirst: async ({ where }: { where: { id: bigint; isActive: boolean } }) => { if (where.id === 1n && where.isActive) return branchRow; return null } },
    employeeProfile: { create: async () => ({ id: 1n }) },
    auditLog: { create: async () => ({ id: 1n }) },
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      const tx = {
        user: { create: base.user.create, findFirst: base.user.findFirst, findUnique: base.user.findUnique, count: async () => 0 },
        role: { findUnique: base.role.findUnique },
        cafeBranch: { findFirst: base.cafeBranch.findFirst },
        employeeProfile: { create: base.employeeProfile.create },
        auditLog: { create: base.auditLog.create },
      }
      return callback(tx)
    },
  }
  const merged = {
    ...base,
    user: { ...base.user, ...overrides.user },
    role: { ...base.role, ...overrides.role },
    cafeBranch: { ...base.cafeBranch, ...overrides.cafeBranch },
    employeeProfile: { ...base.employeeProfile, ...overrides.employeeProfile },
    auditLog: { ...base.auditLog, ...overrides.auditLog },
    $transaction: overrides.$transaction || base.$transaction,
  }
  // Update globalThis.prisma so the prisma Proxy delegates to this mock
  ;(globalThis as any).prisma = merged
  return merged
}

function makeMockSupabase(overrides: any = {}): any {
  const base = {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
        createUser: async () => ({ data: { user: { id: 'new-uuid', email: 'new@acc.test' } }, error: null }),
        inviteUserByEmail: async () => ({ data: { user: { id: 'invited-uuid', email: 'invited@acc.test' } }, error: null }),
        deleteUser: async () => ({ error: null }),
      },
    },
  }
  const merged = Object.assign({}, base, overrides)
  if (overrides.auth) {
    merged.auth = Object.assign({}, base.auth, overrides.auth)
    if (overrides.auth.admin) {
      merged.auth.admin = Object.assign({}, base.auth.admin, overrides.auth.admin)
    }
  }
  return merged
}

test('staff-provision: successful creation links Auth UUID to public.users row', async (t) => {
  mockPrisma = makeMockPrisma()
  const supabase = makeMockSupabase()

  const { inviteStaff } = await import('../src/lib/staff-provision-write')

  const result = await inviteStaff(
    makeOwnerSession(),
    {
      username: 'new_waiter',
      name: 'New Waiter',
      role: ROLE.WAITER,
      branchId: '1',
      accountMode: 'password',
      permanentPassword: 'WaiterPass#2026',
    },
    supabase,
  )

  assert.equal(result.role, ROLE.WAITER)
  assert.equal(result.branchId, '1')
  assert.equal(result.username, 'new_waiter')
})

test('staff-provision: duplicate email (active public.users row) is rejected', async (t) => {
  mockPrisma = makeMockPrisma({ user: { findFirst: async () => ({ id: 'existing-uuid', deletedAt: null, isActive: true }) } })
  const supabase = makeMockSupabase()

  const { inviteStaff } = await import('../src/lib/staff-provision-write')

  await assert.rejects(
    () => inviteStaff(makeOwnerSession(), { username: 'dup_waiter', name: 'Duplicate Waiter', role: ROLE.WAITER, branchId: '1', accountMode: 'password', permanentPassword: 'WaiterPass#2026' }, supabase),
    /يوجد حساب مسجل بهذا البريد بالفعل/,
  )
})

test('staff-provision: soft-deleted user requires system review reactivation', async (t) => {
  mockPrisma = makeMockPrisma({ user: { findFirst: async () => ({ id: 'soft-uuid', deletedAt: new Date(), isActive: false }) } })
  const supabase = makeMockSupabase()

  const { inviteStaff } = await import('../src/lib/staff-provision-write')

  await assert.rejects(
    () => inviteStaff(makeOwnerSession(), { username: 'soft_waiter', name: 'Soft Waiter', role: ROLE.WAITER, branchId: '1', accountMode: 'password', permanentPassword: 'WaiterPass#2026' }, supabase),
    /هذا الحساب موجود مسبقاً وموقوف/,
  )
})

test('staff-provision: orphaned Auth identity requires explicit reconciliation (no auto-adoption)', async (t) => {
  mockPrisma = makeMockPrisma({ user: { findFirst: async () => null, findUnique: async () => null } })
  const supabase = makeMockSupabase({ auth: { admin: { listUsers: async () => ({ data: { users: [{ id: 'auth-uuid-orphan-0009', email: 'staff.orphan_waiter@accounts.skoon.invalid' }] }, error: null }) } } })

  const { inviteStaff } = await import('../src/lib/staff-provision-write')

  await assert.rejects(
    () => inviteStaff(makeOwnerSession(), { username: 'orphan_waiter', name: 'Orphan Waiter', role: ROLE.WAITER, branchId: '1', accountMode: 'password', permanentPassword: 'OrphanPass#2026' }, supabase, 'orphan_waiter'),
    /هوية الدخول غير مرتبطة — يرجى إجراء الموافقة الضمنية لإعادة المطابقة/,
  )
})

test('staff-provision: non-owner cannot create employee (403)', async (t) => {
  mockPrisma = makeMockPrisma()
  const supabase = makeMockSupabase()

  const { inviteStaff } = await import('../src/lib/staff-provision-write')

  await assert.rejects(
    () => inviteStaff(makeWaiterSession(), { username: 'hack_waiter', name: 'Hack Waiter', role: ROLE.WAITER, branchId: '1', accountMode: 'password', permanentPassword: 'HackPass#2026' }, supabase),
    /غير مصرح/,
  )
})

test('staff-provision: manager cannot assign owner role (403)', async (t) => {
  mockPrisma = makeMockPrisma()
  const supabase = makeMockSupabase()

  const managerSession = Object.assign({}, makeOwnerSession(), { role: ROLE.MANAGER, branchId: '1' })

  const { inviteStaff } = await import('../src/lib/staff-provision-write')

  await assert.rejects(
    () => inviteStaff(managerSession, { username: 'hack_owner', name: 'Hack Owner', role: ROLE.OWNER, branchId: '1', accountMode: 'password', permanentPassword: 'HackPass#2026' }, supabase),
    /غير مصرح/,
  )
})

test('staff-provision: already-linked Auth identity is rejected (no double-linking)', async (t) => {
  mockPrisma = makeMockPrisma({ user: { findFirst: async () => null, findUnique: async () => ({ id: 'auth-uuid-linked-0005' }) } })
  const supabase = makeMockSupabase({ auth: { admin: { listUsers: async () => ({ data: { users: [{ id: 'auth-uuid-linked-0005', email: 'staff.linked_waiter@accounts.skoon.invalid' }] }, error: null }) } } })

  const { inviteStaff } = await import('../src/lib/staff-provision-write')

  await assert.rejects(
    () => inviteStaff(makeOwnerSession(), { username: 'linked_waiter', name: 'Linked Waiter', role: ROLE.WAITER, branchId: '1', accountMode: 'password', permanentPassword: 'LinkedPass#2026' }, supabase, 'linked_waiter'),
    /يوجد حساب موظف موجود بهذه الهوية بالفعل/,
  )
})

test('staff-provision: DB failure reports rollback failure accurately', async (t) => {
  mockPrisma = makeMockPrisma({ $transaction: async () => { throw new Error('DB write failed') } })
  const supabase = makeMockSupabase()

  const { inviteStaff } = await import('../src/lib/staff-provision-write')

  await assert.rejects(
    () => inviteStaff(makeOwnerSession(), { username: 'rollbackfail_waiter', name: 'Rollback Fail Waiter', role: ROLE.WAITER, branchId: '1', accountMode: 'password', permanentPassword: 'RollbackFailPass#2026' }, supabase),
    /فشل التراجع عن حساب الدخول/,
  )
})

test('staff-provision: Manager cannot provision owner role', async (t) => {
  mockPrisma = makeMockPrisma()
  const supabase = makeMockSupabase()

  const managerSession = Object.assign({}, makeOwnerSession(), { role: ROLE.MANAGER, branchId: '1' })

  const { inviteStaff } = await import('../src/lib/staff-provision-write')

  await assert.rejects(
    () => inviteStaff(managerSession, { username: 'owner_waiter', name: 'Owner Waiter', role: ROLE.OWNER, branchId: '1', accountMode: 'password', permanentPassword: 'OwnerPass#2026' }, supabase),
    /غير مصرح/,
  )
})
