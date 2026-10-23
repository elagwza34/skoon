/**
 * HR foundation database acceptance.  The runner binds this test to the one
 * explicitly authorised disposable Skoon project and the fixture removes only
 * UUIDs/branches it created.  It never calls Supabase Auth or finance code.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

const safe = process.env.SKOON_TEST_DATABASE_AUTHORIZED === 'test-data-only'
  && process.env.SKOON_TEST_DATABASE_PROJECT_REF === 'bkgxjutnfkslpgshufhb'
const skip = safe ? false : 'Requires the explicitly authorised Skoon test database; no fixtures were created.'

test('HR PostgreSQL: owner lifecycle, manager isolation, contracts and effective compensation', { skip }, async () => {
  const { prisma } = await import('../src/lib/prisma')
  const { ROLE } = await import('../src/lib/authz')
  const {
    addCompensationRate,
    addEmployeeContract,
    archiveEmployee,
    getEmployee,
    listEmployees,
    reactivateEmployee,
    updateEmployeeProfile,
  } = await import('../src/lib/staff-employee-write')
  type Session = import('../src/lib/session').StaffSession

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids = {
    owner: randomUUID(),
    manager: randomUUID(),
    employee: randomUUID(),
    outsider: randomUUID(),
  }
  const roleRows = await prisma.role.findMany({
    where: { slug: { in: [ROLE.OWNER, ROLE.MANAGER, ROLE.WAITER] } },
    select: { id: true, slug: true },
  })
  const ownerRole = roleRows.find((row) => row.slug === ROLE.OWNER)
  const managerRole = roleRows.find((row) => row.slug === ROLE.MANAGER)
  const waiterRole = roleRows.find((row) => row.slug === ROLE.WAITER)
  if (!ownerRole || !managerRole || !waiterRole) throw new Error('Required HR test roles are missing')

  let branchIds: bigint[] = []
  try {
    const branch = await prisma.cafeBranch.create({ data: { name: `HR test ${suffix}`, code: `HR-${suffix}`, timezone: 'Africa/Cairo' } })
    const otherBranch = await prisma.cafeBranch.create({ data: { name: `HR other ${suffix}`, code: `HRO-${suffix}`, timezone: 'Africa/Cairo' } })
    branchIds = [branch.id, otherBranch.id]
    await prisma.user.createMany({ data: [
      { id: ids.owner, roleId: ownerRole.id, name: 'HR Test Owner' },
      { id: ids.manager, roleId: managerRole.id, branchId: branch.id, name: 'HR Test Manager' },
      { id: ids.employee, roleId: waiterRole.id, branchId: branch.id, name: 'HR Test Employee' },
      { id: ids.outsider, roleId: waiterRole.id, branchId: otherBranch.id, name: 'HR Other Employee' },
    ] })

    const owner: Session = { id: ids.owner, email: null, name: 'HR Test Owner', role: ROLE.OWNER, branchId: null, permissions: [] }
    const manager: Session = { id: ids.manager, email: null, name: 'HR Test Manager', role: ROLE.MANAGER, branchId: branch.id.toString(), permissions: [] }

    await updateEmployeeProfile(owner, ids.employee, {
      personalEmail: `employee.${suffix}@example.test`,
      emergencyContactName: 'Emergency Contact',
      probationStart: '2026-10-01',
      probationEnd: '2026-10-31',
      probationStatus: 'active',
    })
    await assert.rejects(
      () => updateEmployeeProfile(manager, ids.employee, { personalPhone: '01000000000' }),
      /Owner access is required/,
    )

    const managerRows = await listEmployees(manager)
    assert.equal(managerRows.some((row) => row.id === ids.employee), true)
    assert.equal(managerRows.some((row) => row.id === ids.outsider), false)
    const managerDetail = await getEmployee(manager, ids.employee) as Record<string, unknown>
    assert.equal('employeeProfile' in managerDetail, false)
    const ownerDetail = await getEmployee(owner, ids.employee) as { employeeProfile: { personalEmail: string | null } | null }
    assert.equal(ownerDetail.employeeProfile?.personalEmail, `employee.${suffix}@example.test`)

    await addEmployeeContract(owner, ids.employee, {
      contractType: 'permanent', effectiveFrom: '2026-10-01', notes: 'HR database acceptance fixture',
    })
    const firstRate = await addCompensationRate(owner, ids.employee, {
      compensationType: 'monthly', paymentFrequency: 'monthly', amount: 5000, effectiveFrom: '2026-10-01', reason: 'Initial test rate',
    })
    await addCompensationRate(owner, ids.employee, {
      compensationType: 'monthly', paymentFrequency: 'monthly', amount: 5500, effectiveFrom: '2026-11-01', reason: 'Effective rate change',
    })
    const firstRateAfter = await prisma.compensationRate.findUniqueOrThrow({ where: { id: firstRate.id } })
    assert.equal(firstRateAfter.effectiveUntil?.toISOString().slice(0, 10), '2026-10-31')

    await archiveEmployee(owner, ids.employee, 'HR database acceptance archive')
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.employee } })).isActive, false)
    await reactivateEmployee(owner, ids.employee)
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: ids.employee } })).isActive, true)
  } finally {
    if (branchIds.length) {
      await prisma.auditLog.deleteMany({ where: { branchId: { in: branchIds } } })
      await prisma.compensationRate.deleteMany({ where: { branchId: { in: branchIds } } })
      await prisma.employmentContract.deleteMany({ where: { branchId: { in: branchIds } } })
      await prisma.employeeProfile.deleteMany({ where: { branchId: { in: branchIds } } })
      await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } })
      await prisma.cafeBranch.deleteMany({ where: { id: { in: branchIds } } })
    }
  }
})
