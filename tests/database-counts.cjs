// Read-only database inventory for acceptance-test safety checks. It reports
// counts only and never prints connection details or record contents.
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

;(async () => {
  const [branches, users, orders, payments, shifts, financialMovements] = await Promise.all([
    prisma.cafeBranch.count(),
    prisma.user.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.shift.count(),
    prisma.financialMovement.count(),
  ])
  console.log(JSON.stringify({ branches, users, orders, payments, shifts, financialMovements }))
})()
  .catch((error) => {
    const table = error && error.meta && typeof error.meta.table === 'string' ? error.meta.table : 'unknown'
    console.error(`Read-only database count query failed: ${error.code || error.name}; table=${table}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
