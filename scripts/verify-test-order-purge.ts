import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const cutoff = new Date('2026-10-26T00:00:00+03:00')

async function main() {
  const [orders, payments, items, responsibilityHistory, tableTransfers] = await Promise.all([
    prisma.order.count({ where: { createdAt: { lt: cutoff } } }),
    prisma.payment.count({ where: { order: { createdAt: { lt: cutoff } } } }),
    prisma.orderItem.count({ where: { order: { createdAt: { lt: cutoff } } } }),
    prisma.orderResponsibilityHistory.count({ where: { order: { createdAt: { lt: cutoff } } } }),
    prisma.orderTableTransfer.count({ where: { order: { createdAt: { lt: cutoff } } } }),
  ])

  console.log(JSON.stringify({ cutoff: cutoff.toISOString(), orders, payments, items, responsibilityHistory, tableTransfers }, null, 2))
}

main().finally(() => prisma.$disconnect())
