import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { slug: { not: 'owner' } } },
    select: { id: true, name: true, email: true, role: { select: { slug: true, name: true } } },
    orderBy: [{ role: { slug: 'asc' } }, { name: 'asc' }],
  })
  const owners = await prisma.user.findMany({
    where: { role: { slug: 'owner' } },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })
  console.log(JSON.stringify({ owners, nonOwnerUserCount: users.length, nonOwners: users }, null, 2))
}

main().finally(() => prisma.$disconnect())
