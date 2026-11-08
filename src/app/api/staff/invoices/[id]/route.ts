import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { invoiceDeletionPolicy } from '@/lib/invoice-deletion-policy'
import { prisma } from '@/lib/prisma'
export const dynamic = 'force-dynamic'
export async function PATCH(_req: Request, _context: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json(
    { error: 'تعديل الفواتير من خلال واجهة الفواتير المفتوحة فقط.' },
    { status: 405, headers: { Allow: 'DELETE' } },
  )
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  const { id } = await context.params
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const order = await prisma.order.findUnique({
    where: { id: BigInt(id) },
    select: {
      id: true,
      cancelledAt: true,
      status: true,
      isArchived: true,
      branchId: true,
    },
  })
  if (!order) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
  if (order.isArchived) return NextResponse.json({ error: 'الفاتورة مؤرشفة بالفعل' }, { status: 409 })

  // Gather financial/operational/audit activity before applying policy.
  // InventoryReservation relates to OrderItem (not Order directly), so traverse
  // through the orderItem relation to find any active reservations for this order.
  const [payments, reservations, auditCount] = await Promise.all([
    prisma.payment.aggregate({
      where: { orderId: BigInt(id), status: 'completed' },
      _sum: { amount: true },
    }),
    prisma.inventoryReservation.findFirst({
      where: {
        orderItem: { orderId: BigInt(id) },
        status: 'active',
      },
      select: { id: true },
    }),
    prisma.auditLog.count({
      where: { entityType: 'order', entityId: BigInt(id) },
    }),
  ])

  const policy = invoiceDeletionPolicy({
    role: session.role,
    isCancelled: !!order.cancelledAt,
    hasCompletedPayments: Number(payments._sum.amount ?? 0) > 0,
    hasInventoryActivity: reservations !== null,
    hasAuditHistory: auditCount > 0,
  })

  if (policy.status !== 200 || !policy.allow) {
    return NextResponse.json({ error: policy.error }, { status: policy.status, headers: policy.allow ? { Allow: policy.allow } : undefined })
  }

  // Soft-archive a cancelled invoice only — moves it from cancelled to deleted tab.
  // No hard deletion of orders, payments, refunds, inventory movements, or audit events ever occurs.
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: BigInt(id) }, data: { isArchived: true } })
    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: order.branchId,
        action: 'invoice.archived',
        entityType: 'order',
        entityId: BigInt(id),
        oldValues: { status: order.status, cancelledAt: order.cancelledAt?.toString() ?? null, isArchived: false },
        newValues: { isArchived: true, archivedBy: session.id },
      },
    })
  })

  return NextResponse.json({ id, archived: true })
}
