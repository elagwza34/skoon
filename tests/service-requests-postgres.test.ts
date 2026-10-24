import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { test } from 'node:test'

const allowed = process.env.SKOON_TEST_DATABASE_AUTHORIZED === 'test-data-only' && process.env.SKOON_TEST_DATABASE_PROJECT_REF === 'bkgxjutnfkslpgshufhb'
const skip = allowed ? false : 'Requires explicitly authorised Skoon test database; no fixtures were created.'

test('Service requests PostgreSQL: QR cooldown, complaint limit, atomic claims, reassignment and branch scope', { skip, timeout: 60_000 }, async () => {
  const { prisma } = await import('../src/lib/prisma')
  const { ROLE } = await import('../src/lib/authz')
  const { createPublicServiceRequest, actOnServiceRequest, listServiceRequests } = await import('../src/lib/staff-service-requests')
  type Session = import('../src/lib/session').StaffSession
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const ids = {
    manager: randomUUID(),
    waiterA: randomUUID(),
    waiterB: randomUUID(),
    outsider: randomUUID(),
    noShiftWaiter: randomUUID(),
    owner: randomUUID(),
  }
  const token = () => randomBytes(8).toString('hex')
  let branches: bigint[] = []; let tables: bigint[] = []
  try {
    const roles = await prisma.role.findMany({ where: { slug: { in: [ROLE.OWNER, ROLE.MANAGER, ROLE.WAITER] } }, select: { id: true, slug: true } })
    const ownerRole = roles.find((r) => r.slug === ROLE.OWNER); const managerRole = roles.find((r) => r.slug === ROLE.MANAGER); const waiterRole = roles.find((r) => r.slug === ROLE.WAITER)
    if (!ownerRole || !managerRole || !waiterRole) throw new Error('Required roles are missing')
    const [branch, other] = await Promise.all([
      prisma.cafeBranch.create({ data: { name: `SR ${suffix}`, code: `SR${suffix}` } }),
      prisma.cafeBranch.create({ data: { name: `SR other ${suffix}`, code: `SX${suffix}` } }),
    ]); branches = [branch.id, other.id]
    const [table, otherTable] = await Promise.all([
      prisma.cafeTable.create({ data: { branchId: branch.id, number: `T-${suffix}`, publicToken: token() } }),
      prisma.cafeTable.create({ data: { branchId: other.id, number: `O-${suffix}`, publicToken: token() } }),
    ]); tables = [table.id, otherTable.id]
    await prisma.user.createMany({ data: [
      { id: ids.manager, roleId: managerRole.id, branchId: branch.id, name: 'SR Manager' },
      { id: ids.waiterA, roleId: waiterRole.id, branchId: branch.id, name: 'SR Waiter A' },
      { id: ids.waiterB, roleId: waiterRole.id, branchId: branch.id, name: 'SR Waiter B' },
      { id: ids.outsider, roleId: waiterRole.id, branchId: other.id, name: 'SR Outsider' },
      { id: ids.noShiftWaiter, roleId: waiterRole.id, branchId: branch.id, name: 'SR No Shift' },
      { id: ids.owner, roleId: ownerRole.id, name: 'SR Owner' },
    ] })
    await prisma.shift.createMany({ data: [
      { branchId: branch.id, openBy: 'SR Waiter A', cashierId: ids.waiterA, status: 'open' },
      { branchId: branch.id, openBy: 'SR Waiter B', cashierId: ids.waiterB, status: 'open' },
      { branchId: other.id, openBy: 'SR Outsider', cashierId: ids.outsider, status: 'open' },
    ] })
    const manager: Session = { id: ids.manager, email: null, name: 'SR Manager', role: ROLE.MANAGER, branchId: branch.id.toString(), permissions: [] }
    const waiterA: Session = { id: ids.waiterA, email: null, name: 'SR Waiter A', role: ROLE.WAITER, branchId: branch.id.toString(), permissions: [] }
    const waiterB: Session = { id: ids.waiterB, email: null, name: 'SR Waiter B', role: ROLE.WAITER, branchId: branch.id.toString(), permissions: [] }
    const outsider: Session = { id: ids.outsider, email: null, name: 'SR Outsider', role: ROLE.WAITER, branchId: other.id.toString(), permissions: [] }
    const noShiftWaiter: Session = { id: ids.noShiftWaiter, email: null, name: 'SR No Shift', role: ROLE.WAITER, branchId: branch.id.toString(), permissions: [] }
    const owner: Session = { id: ids.owner, email: null, name: 'SR Owner', role: ROLE.OWNER, branchId: null, permissions: [] }

    const first = await createPublicServiceRequest({ token: table.publicToken, type: 'water' })
    const dup = await Promise.allSettled([createPublicServiceRequest({ token: table.publicToken, type: 'water' }), createPublicServiceRequest({ token: table.publicToken, type: 'water' })])
    assert.equal(dup.filter((result) => result.status === 'fulfilled').length, 0)
    assert.equal((await prisma.serviceRequest.count({ where: { tableId: table.id, type: 'water' } })), 1)
    const complaintResults = await Promise.allSettled(Array.from({ length: 4 }, () => createPublicServiceRequest({ token: table.publicToken, type: 'complaint' })))
    assert.equal(complaintResults.filter((result) => result.status === 'fulfilled').length, 3)
    assert.equal(complaintResults.filter((result) => result.status === 'rejected').length, 1)
    const otherRequest = await createPublicServiceRequest({ token: otherTable.publicToken, type: 'water' })
    assert.ok(otherRequest.id)

    const claims = await Promise.allSettled([actOnServiceRequest(waiterA, BigInt(first.id), { action: 'accept' }), actOnServiceRequest(waiterB, BigInt(first.id), { action: 'accept' })])
    assert.equal(claims.filter((result) => result.status === 'fulfilled').length, 1)
    const claimed = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: BigInt(first.id) } })
    assert.ok([String(ids.waiterA), String(ids.waiterB)].includes(claimed.claimedById ?? ''))
    const losing = claimed.claimedById === ids.waiterA ? waiterB : waiterA
    await assert.rejects(() => actOnServiceRequest(losing, BigInt(first.id), { action: 'resolve', reason: 'not mine' }), /assigned waiter/)
    await assert.rejects(() => actOnServiceRequest(losing, BigInt(first.id), { action: 'in_progress' }), /assigned waiter/)
    await assert.rejects(() => actOnServiceRequest(noShiftWaiter, BigInt(first.id), { action: 'in_progress' }), /open shift is required/i)
    // Managers retain their authorized supervisory actions without an
    // operational shift or attendance record in the current MVP.
    await actOnServiceRequest(manager, BigInt(first.id), { action: 'reassign', assigneeId: ids.waiterB })
    await assert.rejects(() => actOnServiceRequest(waiterA, BigInt(first.id), { action: 'resolve', reason: 'stale owner' }), /assigned waiter/)
    await actOnServiceRequest(waiterB, BigInt(first.id), { action: 'in_progress' })
    await actOnServiceRequest(waiterB, BigInt(first.id), { action: 'resolve', reason: 'completed fixture request' })
    assert.equal((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: BigInt(first.id) } })).status, 'resolved')
    await actOnServiceRequest(owner, BigInt(otherRequest.id), { action: 'accept' })
    assert.equal((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: BigInt(otherRequest.id) } })).claimedById, ids.owner)
    assert.equal((await listServiceRequests(manager, {})).some((row) => row.id === BigInt(otherRequest.id)), false)
    await assert.rejects(() => actOnServiceRequest(outsider, BigInt(first.id), { action: 'accept' }), /not found/)
  } finally {
    try {
      if (branches.length) {
        await prisma.notification.deleteMany({ where: { userId: { in: Object.values(ids) } } })
        await prisma.auditLog.deleteMany({ where: { branchId: { in: branches } } })
        await prisma.serviceRequest.deleteMany({ where: { branchId: { in: branches } } })
        await prisma.shift.deleteMany({ where: { branchId: { in: branches } } })
        await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } })
        await prisma.cafeTable.deleteMany({ where: { id: { in: tables } } })
        await prisma.cafeBranch.deleteMany({ where: { id: { in: branches } } })
      }
    } finally {
      // This is a standalone Node test process. A cleanup error must never
      // leave its shared Prisma pool alive and strand the Node test runner.
      await prisma.$disconnect()
    }
  }
})
