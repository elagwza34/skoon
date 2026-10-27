import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { canManageEmployeeLifecycle } from '@/lib/hr-authz'
import { prisma } from '@/lib/prisma'
import { getStaffSession } from '@/lib/session'

export const dynamic = 'force-dynamic'
export async function GET() {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!canManageEmployeeLifecycle(session.role)) return NextResponse.json({ error: 'Owner access is required' }, { status: 403 })
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const [employees, activeEmployees, openShifts, leavePending, overtimePending, payroll] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, isActive: true } }),
      prisma.shift.count({ where: { status: 'open', openedAt: { gte: today } } }),
      prisma.leaveRequest.count({ where: { status: 'pending' } }),
      prisma.overtimeRequest.count({ where: { status: 'pending' } }),
      prisma.payrollLine.aggregate({ _sum: { netAmount: true, paidAmount: true } }),
    ])
    const net = payroll._sum.netAmount ?? new Prisma.Decimal(0); const paid = payroll._sum.paidAmount ?? new Prisma.Decimal(0)
    return NextResponse.json({ employees, activeEmployees, presentToday: openShifts, pendingApprovals: leavePending + overtimePending, totalPayroll: net.toString(), paidPayroll: paid.toString(), outstandingPayroll: net.minus(paid).toString() })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') return NextResponse.json({ error: 'Phase D HR migration is not applied yet' }, { status: 503 })
    return NextResponse.json({ error: 'Unable to load HR overview' }, { status: 500 })
  }
}
