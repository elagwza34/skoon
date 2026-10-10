// prisma/seed.ts — reference-data seed ONLY (idempotent, non-destructive).
//
// What it does:
//   - Upserts the 5 canonical roles (owner/manager/waiter/kitchen/cashier).
//   - Upserts the 18 documented permissions (docs/DATABASE-DESIGN.md §2.4).
//   - Links ALL permissions to the `owner` role only (owner = superuser).
// What it NEVER does:
//   - Creates User rows (User.id must equal a Supabase Auth UUID, provisioned
//     only via the trusted server-side flow — see docs/OWNER-PROVISIONING.md).
//   - Writes passwords, PINs, or any secret (pinHash stays NULL).
//   - Deletes or modifies existing rows (upsert with empty update).
// Non-owner role grants are intentionally left EMPTY pending approval of the
// role-permission matrix (least-privilege default; documented, not invented).
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ROLES: { slug: string; name: string; description: string }[] = [
  { slug: 'owner', name: 'مالك', description: 'مالك النظام — صلاحيات كاملة، عابر للفروع' },
  { slug: 'manager', name: 'مدير', description: 'مدير الفرع — إدارة المنيو والموظفين والتقارير' },
  { slug: 'waiter', name: 'ويتر', description: 'أخذ الطلبات ومتابعة الطاولات' },
  { slug: 'kitchen', name: 'مطبخ', description: 'متابعة وتحضير الطلبات' },
  { slug: 'cashier', name: 'كاشير', description: 'الدفع وتحصيل الطلبات' },
]

const PERMISSIONS: { slug: string; name: string; groupName: string }[] = [
  { slug: 'orders.view', name: 'عرض الطلبات', groupName: 'orders' },
  { slug: 'orders.update', name: 'تعديل الطلبات', groupName: 'orders' },
  { slug: 'orders.cancel', name: 'إلغاء الطلبات', groupName: 'orders' },
  { slug: 'orders.refund', name: 'استرداد المدفوعات', groupName: 'orders' },
  { slug: 'orders.kitchen_status', name: 'تحديث حالة المطبخ', groupName: 'orders' },
  { slug: 'orders.serve', name: 'تقديم الطلبات', groupName: 'orders' },
  { slug: 'menu.view', name: 'عرض المنيو', groupName: 'menu' },
  { slug: 'menu.update', name: 'تعديل المنيو', groupName: 'menu' },
  { slug: 'tables.view', name: 'عرض الطاولات', groupName: 'tables' },
  { slug: 'tables.manage', name: 'إدارة الطاولات', groupName: 'tables' },
  { slug: 'staff.view', name: 'عرض الموظفين', groupName: 'staff' },
  { slug: 'staff.manage', name: 'إدارة الموظفين', groupName: 'staff' },
  { slug: 'reports.view', name: 'عرض التقارير', groupName: 'reports' },
  { slug: 'inventory.view', name: 'عرض المخزون', groupName: 'inventory' },
  { slug: 'inventory.manage', name: 'إدارة المخزون', groupName: 'inventory' },
  { slug: 'discounts.manage', name: 'إدارة الخصومات', groupName: 'discounts' },
  { slug: 'settings.manage', name: 'إدارة الإعدادات', groupName: 'settings' },
  { slug: 'audit.view', name: 'عرض سجل التدقيق', groupName: 'audit' },
]

async function main() {
  const roleIds = new Map<string, bigint>()
  for (const r of ROLES) {
    const row = await prisma.role.upsert({
      where: { slug: r.slug },
      update: {},
      create: { slug: r.slug, name: r.name, description: r.description, isSystem: true },
    })
    roleIds.set(r.slug, row.id)
  }

  const permIds = new Map<string, bigint>()
  for (const p of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { slug: p.slug },
      update: {},
      create: { slug: p.slug, name: p.name, groupName: p.groupName },
    })
    permIds.set(p.slug, row.id)
  }

  const ownerId = roleIds.get('owner')!
  let ownerLinks = 0
  for (const permId of permIds.values()) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: ownerId, permissionId: permId } },
      update: {},
      create: { roleId: ownerId, permissionId: permId },
    })
    ownerLinks++
  }

  // Read-only verification output (no secrets, no PII).
  const [roleCount, permCount, ownerLinkCount, userCount] = await Promise.all([
    prisma.role.count(),
    prisma.permission.count(),
    prisma.rolePermission.count({ where: { roleId: ownerId } }),
    prisma.user.count(),
  ])
  console.log(
    JSON.stringify({ roles: roleCount, permissions: permCount, ownerLinks: ownerLinkCount, users: userCount }),
  )
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
