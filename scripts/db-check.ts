import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const [roles, branches, users] = await Promise.all([
    prisma.role.findMany({ select: { slug: true } }),
    prisma.cafeBranch.findMany({ select: { id: true, name: true, code: true } }),
    prisma.user.findMany({ select: { email: true, role: { select: { slug: true } } } }),
  ])
  console.log(
    JSON.stringify({
      roles: roles.map((r) => r.slug),
      branches: branches.map((b) => ({ id: b.id.toString(), name: b.name, code: b.code })),
      users: users.map((u) => ({ email: u.email, role: u.role.slug })),
    }),
  )
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('DB_FAIL:' + (e as Error).message)
    await prisma.$disconnect()
    process.exit(1)
  })
