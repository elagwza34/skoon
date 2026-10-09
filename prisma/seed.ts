// seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed roles
  const owner = await prisma.role.upsert({
    where: { slug: 'owner' },
    update: {},
    create: { slug: 'owner', name: 'مالك', isSystem: true },
  })
  // ... more seeds
}

main()
  .then(async () => process.exit(0))
  .catch(async (e) => {
    console.error(e)
    process.exit(1)
  })
