import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRaw<{ record_type: string; count: bigint }[]>`
    WITH targets AS (SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug <> 'owner')
    SELECT 'employee_profiles' AS record_type, COUNT(*)::bigint AS count FROM employee_profiles WHERE user_id IN (SELECT id FROM targets) OR archived_by IN (SELECT id FROM targets)
    UNION ALL SELECT 'employment_contracts', COUNT(*)::bigint FROM employment_contracts WHERE uploaded_by IN (SELECT id FROM targets)
    UNION ALL SELECT 'compensation_rates', COUNT(*)::bigint FROM compensation_rates WHERE set_by IN (SELECT id FROM targets)
    UNION ALL SELECT 'employee_accountability', COUNT(*)::bigint FROM employee_accountability WHERE employee_id IN (SELECT id FROM targets) OR reviewed_by IN (SELECT id FROM targets)
    UNION ALL SELECT 'accountability_waivers', COUNT(*)::bigint FROM accountability_waivers WHERE manager_id IN (SELECT id FROM targets)
    UNION ALL SELECT 'financial_movements', COUNT(*)::bigint FROM financial_movements WHERE destination_user_id IN (SELECT id FROM targets)
    UNION ALL SELECT 'order_responsibility_history', COUNT(*)::bigint FROM order_responsibility_history WHERE assigned_by IN (SELECT id FROM targets)
    UNION ALL SELECT 'order_table_transfers', COUNT(*)::bigint FROM order_table_transfers WHERE transferred_by IN (SELECT id FROM targets)
    UNION ALL SELECT 'stock_counts', COUNT(*)::bigint FROM stock_counts WHERE responsible_id IN (SELECT id FROM targets) OR posted_by IN (SELECT id FROM targets)
    UNION ALL SELECT 'waiter_shift_handovers', COUNT(*)::bigint FROM waiter_shift_handovers WHERE requested_by IN (SELECT id FROM targets) OR recipient_waiter_id IN (SELECT id FROM targets)
    ORDER BY record_type
  `
  console.log(JSON.stringify(rows, (_, value) => typeof value === 'bigint' ? Number(value) : value, 2))
}

main().finally(() => prisma.$disconnect())
