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
    select: { id: true, cancelledAt: true, status: true, isArchived: true },
  })
  if (!order) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
  if (order.isArchived) return NextResponse.json({ error: 'الفاتورة مؤرشفة بالفعل' }, { status: 409 })

  const policy = invoiceDeletionPolicy({ role: session.role, isCancelled: !!order.cancelledAt })
  if (policy.status !== 200 || !policy.allow) {
    return NextResponse.json({ error: policy.error }, { status: policy.status, headers: policy.allow ? { Allow: policy.allow } : undefined })
  }

  // archive (soft delete) a cancelled invoice only — moves it from cancelled to deleted tab
  await prisma.order.update({ where: { id: BigInt(id) }, data: { isArchived: true } })
  return NextResponse.json({ id, archived: true })
}
