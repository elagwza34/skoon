const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    return tx.$queryRawUnsafe(`
      select 'orders' as table_name, count(*)::text as rows from public.orders
      union all select 'payments', count(*)::text from public.payments
      union all select 'shifts', count(*)::text from public.shifts
      union all select 'inventory_items', count(*)::text from public.inventory_items
      union all select 'inventory_batches', count(*)::text from public.inventory_batches
      union all select 'financial_movements', count(*)::text from public.financial_movements
      union all select 'financial_operations', count(*)::text from public.financial_operations
      union all select 'audit_logs', count(*)::text from public.audit_logs
      order by table_name
    `)
  })
  process.stdout.write(`${JSON.stringify(rows)}\n`)
}

main().finally(() => prisma.$disconnect())
