import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const cutoff = new Date('2026-10-26T00:00:00+03:00')

async function main() {
  const rows = await prisma.$queryRaw<{ external_reversal_references: bigint; external_advance_references: bigint }[]>`
    WITH target_movements AS (
      SELECT id FROM financial_movements
      WHERE source_shift_id IN (SELECT id FROM shifts WHERE opened_at < ${cutoff})
    )
    SELECT
      COUNT(*) FILTER (WHERE reversal_of_id IN (SELECT id FROM target_movements) AND id NOT IN (SELECT id FROM target_movements)) AS external_reversal_references,
      COUNT(*) FILTER (WHERE advance_id IN (SELECT id FROM target_movements) AND id NOT IN (SELECT id FROM target_movements)) AS external_advance_references
    FROM financial_movements
  `
  console.log(JSON.stringify(rows[0], (_, value) => typeof value === 'bigint' ? Number(value) : value, 2))
}

main().finally(() => prisma.$disconnect())
