import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const cutoff = new Date('2026-10-26T00:00:00+03:00')

async function main() {
  const shiftWhere = { openedAt: { lt: cutoff } }
  const [shifts, movements, handovers] = await Promise.all([
    prisma.shift.count({ where: shiftWhere }),
    prisma.financialMovement.count({ where: { sourceShift: shiftWhere } }),
    prisma.waiterShiftHandover.count({ where: { senderShift: shiftWhere } }),
  ])

  console.log(JSON.stringify({ cutoff: cutoff.toISOString(), shifts, financialMovements: movements, waiterShiftHandovers: handovers }, null, 2))
}

main().finally(() => prisma.$disconnect())
