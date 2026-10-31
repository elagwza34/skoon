import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const cutoff = new Date('2026-10-26T00:00:00+03:00')

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const shiftWhere = { openedAt: { lt: cutoff } }
    const movementWhere = { sourceShift: shiftWhere }

    const waiterHandovers = await tx.waiterShiftHandover.deleteMany({ where: { senderShift: shiftWhere } })
    await tx.financialMovement.updateMany({ where: movementWhere, data: { reversalOfId: null, advanceId: null } })
    const financialMovements = await tx.financialMovement.deleteMany({ where: movementWhere })
    const shifts = await tx.shift.deleteMany({ where: shiftWhere })

    return { waiterHandovers: waiterHandovers.count, financialMovements: financialMovements.count, shifts: shifts.count }
  }, { timeout: 30_000 })

  console.log(JSON.stringify({ cutoff: cutoff.toISOString(), ...result }, null, 2))
}

main().finally(() => prisma.$disconnect())
