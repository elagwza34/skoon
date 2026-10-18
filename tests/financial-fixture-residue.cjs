// Read-only check for acceptance-suite residue. The suite alone creates these
// branch-code prefixes, so this never inspects application record contents.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

;(async () => {
  const fixtureRows = await prisma.cafeBranch.findMany({ where: { OR: [{ code: { startsWith: 'FIN-' } }, { code: { startsWith: 'OTH-' } }] }, select: { id: true, code: true } })
  const fixtureIds = fixtureRows.map((row) => row.id)
  const [users, shifts, auditLogs, fixtures, movements, operations] = await Promise.all([
    prisma.user.count({ where: { branchId: { in: fixtureIds } } }),
    prisma.shift.count({ where: { branchId: { in: fixtureIds } } }),
    prisma.auditLog.count({ where: { branchId: { in: fixtureIds } } }),
    prisma.cafeBranch.count({ where: { id: { in: fixtureIds } } }),
    prisma.financialMovement.count(),
    prisma.financialOperation.count(),
  ])
  console.log(JSON.stringify({ fixtures: fixtureRows.map((row) => ({ id: row.id.toString(), code: row.code })), fixtureBranches: fixtures, users, shifts, auditLogs, financialMovements: movements, financialOperations: operations }))
})()
  .catch((error) => {
    console.error(`Read-only fixture residue query failed: ${error.code || error.name}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
