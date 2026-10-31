import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ child: string; definition: string }[]>("SELECT conrelid::regclass::text AS child, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype = 'f' AND confrelid = 'financial_movements'::regclass ORDER BY 1")
  console.log(JSON.stringify(rows, null, 2))
}

main().finally(() => prisma.$disconnect())
