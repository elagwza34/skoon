import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const cutoff = new Date('2026-10-26T00:00:00+03:00')

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const where = { order: { createdAt: { lt: cutoff } } }
    const responsibilityHistory = await tx.orderResponsibilityHistory.deleteMany({ where })
    const tableTransfers = await tx.orderTableTransfer.deleteMany({ where })
    const orders = await tx.order.deleteMany({ where: { createdAt: { lt: cutoff } } })
    return { responsibilityHistory: responsibilityHistory.count, tableTransfers: tableTransfers.count, orders: orders.count }
  }, { timeout: 30_000 })
  console.log(JSON.stringify({ cutoff: cutoff.toISOString(), ...result }, null, 2))
}

main().finally(() => prisma.$disconnect())
