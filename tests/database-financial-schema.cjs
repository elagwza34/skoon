// Read-only acceptance preflight. Reports schema metadata only; no credentials,
// record values, or data mutations.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

;(async () => {
  const [tables, migrations, columns, indexes, counts] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('branches', 'users', 'shifts', 'financial_movements', 'financial_operations') ORDER BY table_name`),
    prisma.$queryRawUnsafe(`SELECT migration_name, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations WHERE migration_name IN ('20261018_advance_repayment_links', '20261018120000_cash_ledger_and_handover', '20261018120100_financial_idempotency_reversals', '20261018120200_advance_repayment_links') ORDER BY migration_name`),
    prisma.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'financial_movements' AND column_name IN ('reversal_of_id', 'advance_id', 'source_account', 'destination_account')) OR (table_name = 'financial_operations' AND column_name IN ('operation_type', 'idempotency_key', 'fingerprint', 'result'))) ORDER BY table_name, column_name`),
    prisma.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('financial_movements', 'financial_operations') ORDER BY indexname`),
    Promise.all([prisma.cafeBranch.count(), prisma.user.count(), prisma.shift.count(), prisma.order.count(), prisma.payment.count()]),
  ])
  const [branches, users, shifts, orders, payments] = counts
  console.log(JSON.stringify({ tables, migrations, columns, indexes, counts: { branches, users, shifts, orders, payments } }))
})()
  .catch((error) => {
    console.error(`Read-only financial schema preflight failed: ${error.code || error.name}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
