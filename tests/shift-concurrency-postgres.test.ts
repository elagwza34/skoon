/** Guarded acceptance for one active operational shift per employee/branch. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

const allowed = process.env.SKOON_TEST_DATABASE_AUTHORIZED === 'test-data-only'
  && process.env.SKOON_TEST_DATABASE_PROJECT_REF === 'bkgxjutnfkslpgshufhb'
const skip = allowed ? false : 'Requires the explicitly authorised Skoon test database; no fixtures were created.'

test('shift PostgreSQL: open/close requests serialize and preserve ownership', { skip, timeout: 60_000 }, async () => {
  const { prisma } = await import('../src/lib/prisma')
  const { ROLE } = await import('../src/lib/authz')
  const { closeShift, openShift, ShiftError } = await import('../src/lib/staff-shifts')
  type Session = import('../src/lib/session').StaffSession

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids = { employee: randomUUID(), colleague: randomUUID(), outsider: randomUUID() }
  const waiterRole = await prisma.role.findUnique({ where: { slug: ROLE.WAITER }, select: { id: true } })
  if (!waiterRole) throw new Error('The waiter role is required')
  const branches: bigint[] = []
  try {
    const [branch, otherBranch] = await Promise.all([
      prisma.cafeBranch.create({ data: { name: `Shift test ${suffix}`, code: `SH-${suffix}`, timezone: 'Africa/Cairo' } }),
      prisma.cafeBranch.create({ data: { name: `Shift other ${suffix}`, code: `SO-${suffix}`, timezone: 'Africa/Cairo' } }),
    ])
    branches.push(branch.id, otherBranch.id)
    await prisma.user.createMany({ data: [
      { id: ids.employee, roleId: waiterRole.id, branchId: branch.id, name: 'Shift Employee' },
      { id: ids.colleague, roleId: waiterRole.id, branchId: branch.id, name: 'Shift Colleague' },
      { id: ids.outsider, roleId: waiterRole.id, branchId: otherBranch.id, name: 'Shift Outsider' },
    ] })
    const employee: Session = { id: ids.employee, email: null, name: 'Shift Employee', role: ROLE.WAITER, branchId: branch.id.toString(), permissions: [] }
    const colleague: Session = { id: ids.colleague, email: null, name: 'Shift Colleague', role: ROLE.WAITER, branchId: branch.id.toString(), permissions: [] }
    const outsider: Session = { id: ids.outsider, email: null, name: 'Shift Outsider', role: ROLE.WAITER, branchId: otherBranch.id.toString(), permissions: [] }

    const opens = await Promise.allSettled([openShift(employee, {}), openShift(employee, {})])
    assert.equal(opens.filter((result) => result.status === 'fulfilled').length, 1)
    const rejectedOpen = opens.find((result) => result.status === 'rejected')
    assert.ok(rejectedOpen?.status === 'rejected' && rejectedOpen.reason instanceof ShiftError && rejectedOpen.reason.status === 409)
    assert.equal(await prisma.shift.count({ where: { branchId: branch.id, cashierId: ids.employee, status: 'open' } }), 1)
    assert.equal(await prisma.auditLog.count({ where: { branchId: branch.id, userId: ids.employee, action: 'shift.open' } }), 1)

    await assert.rejects(() => openShift(employee, {}), (error: unknown) => error instanceof ShiftError && error.status === 409)
    const active = await prisma.shift.findFirstOrThrow({ where: { branchId: branch.id, cashierId: ids.employee, status: 'open' } })
    await assert.rejects(() => closeShift(colleague, active.id.toString(), {}), (error: unknown) => error instanceof ShiftError && error.status === 403)
    await assert.rejects(() => closeShift(outsider, active.id.toString(), {}), (error: unknown) => error instanceof ShiftError && error.status === 403)

    const closes = await Promise.allSettled([closeShift(employee, active.id.toString(), {}), closeShift(employee, active.id.toString(), {})])
    assert.equal(closes.filter((result) => result.status === 'fulfilled').length, 1)
    const rejectedClose = closes.find((result) => result.status === 'rejected')
    assert.ok(rejectedClose?.status === 'rejected' && rejectedClose.reason instanceof ShiftError && rejectedClose.reason.status === 409)
    const closed = await prisma.shift.findUniqueOrThrow({ where: { id: active.id } })
    assert.equal(closed.status, 'closed')
    assert.ok(closed.closedAt)
    assert.equal(await prisma.auditLog.count({ where: { branchId: branch.id, userId: ids.employee, action: 'shift.close' } }), 1)
    await assert.rejects(() => closeShift(employee, active.id.toString(), {}), (error: unknown) => error instanceof ShiftError && error.status === 409)

    await openShift(employee, {})
    assert.equal(await prisma.shift.count({ where: { branchId: branch.id, cashierId: ids.employee, status: 'open' } }), 1)
    assert.equal(await prisma.shift.count({ where: { branchId: branch.id, cashierId: ids.employee, status: 'closed', closedAt: { not: null } } }), 1)
  } finally {
    if (branches.length) {
      await prisma.auditLog.deleteMany({ where: { branchId: { in: branches } } })
      await prisma.shift.deleteMany({ where: { branchId: { in: branches } } })
      await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } })
      await prisma.cafeBranch.deleteMany({ where: { id: { in: branches } } })
    }
    await prisma.$disconnect()
  }
})
