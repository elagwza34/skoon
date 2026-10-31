import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { invoiceDeletionPolicy } from '@/lib/invoice-deletion-policy'
import { prisma } from '@/lib/prisma'
export const dynamic = 'force-dynamic'
export async function PATCH(_req: Request, _context: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json(
    { error: 'تعديل الفاتورات من خلال واجهة الفواتير المفتوحة فقط.' },
    { status: 405, headers: { Allow: 'DELETE' } },
  )
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  const { id } = await context.params
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const order = await prisma.order.findUnique({
    where: { id: BigInt(id) },
    select: { id: true, cancelledAt: true, status: true, branchId: true },
  })
  if (!order) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })

  const policy = invoiceDeletionPolicy({ role: session.role, isCancelled: !!order.cancelledAt })
  if (policy.status !== 200 || !policy.allow) {
    return NextResponse.json({ error: policy.error }, { status: policy.status, headers: policy.allow ? { Allow: policy.allow } : undefined })
  }

  // Permanent deletion of a cancelled invoice only.
  await prisma.order.delete({ where: { id: BigInt(id) } })
  return NextResponse.json({ id, deleted: true })
}
