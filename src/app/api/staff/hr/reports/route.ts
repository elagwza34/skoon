import { NextResponse } from 'next/server'
import { canManageEmployeeLifecycle } from '@/lib/hr-authz'
import { prisma } from '@/lib/prisma'
import { getStaffSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function money(value: { toString(): string } | null | undefined) { return value?.toString() ?? '0.00' }
function csvCell(value: unknown) { return `"${String(value ?? '').replaceAll('"', '""')}"` }
function asDate(value: string | null, fallback: Date) {
  if (!value) return fallback
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Owner-only server-authoritative HR aggregate.  It deliberately reads HR
 * records only, never the POS, till, stock, or operational finance ledgers. */
export async function GET(request: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!canManageEmployeeLifecycle(session.role)) return NextResponse.json({ error: 'Owner access is required' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const endsOn = asDate(searchParams.get('endsOn'), new Date())
  const startsOn = asDate(searchParams.get('startsOn'), new Date(Date.UTC(endsOn?.getUTCFullYear() ?? 1970, endsOn?.getUTCMonth() ?? 0, 1)))
  if (!startsOn || !endsOn || startsOn > endsOn) return NextResponse.json({ error: 'Invalid report period' }, { status: 400 })
  const employeeId = searchParams.get('employeeId') || undefined
  const employeeWhere = employeeId ? { employeeId } : {}
  try {
    const [employees, leaves, overtime, adjustments, advances, payroll] = await Promise.all([
      prisma.user.count({ where: { isActive: true, deletedAt: null, ...(employeeId ? { id: employeeId } : {}) } }),
      prisma.leaveRequest.findMany({ where: { ...employeeWhere, startsOn: { lte: endsOn }, endsOn: { gte: startsOn } }, select: { status: true, isPaid: true, days: true } }),
      prisma.overtimeRequest.findMany({ where: { ...employeeWhere, startsAt: { gte: startsOn, lte: endsOn } }, select: { status: true, detectedMinutes: true, approvedMinutes: true } }),
      prisma.hrAdjustment.findMany({ where: { ...employeeWhere, effectiveOn: { gte: startsOn, lte: endsOn } }, select: { type: true, status: true, amount: true } }),
      prisma.employeeAdvance.findMany({ where: { ...employeeWhere, createdAt: { gte: startsOn, lte: endsOn } }, select: { status: true, amount: true, repaidAmount: true } }),
      prisma.payrollLine.findMany({ where: { ...employeeWhere, createdAt: { gte: startsOn, lte: endsOn } }, select: { status: true, grossAmount: true, deductionAmount: true, netAmount: true, paidAmount: true } }),
    ])
    const decimalSum = (rows: Array<Record<string, unknown>>, field: string, predicate: (row: Record<string, unknown>) => boolean = () => true) => rows.filter(predicate).reduce((sum, row) => sum + Number((row[field] as { toString(): string } | undefined)?.toString() ?? 0), 0).toFixed(2)
    const result = {
      period: { startsOn: startsOn.toISOString().slice(0, 10), endsOn: endsOn.toISOString().slice(0, 10) },
      employees,
      leave: { requests: leaves.length, approvedDays: leaves.filter((row) => row.status === 'approved').reduce((sum, row) => sum + Number(row.days), 0), paidDays: leaves.filter((row) => row.status === 'approved' && row.isPaid === true).reduce((sum, row) => sum + Number(row.days), 0), unpaidDays: leaves.filter((row) => row.status === 'approved' && row.isPaid === false).reduce((sum, row) => sum + Number(row.days), 0) },
      overtime: { requests: overtime.length, approvedMinutes: overtime.filter((row) => row.status === 'approved').reduce((sum, row) => sum + (row.approvedMinutes ?? 0), 0) },
      adjustments: { bonuses: decimalSum(adjustments as Array<Record<string, unknown>>, 'amount', (row) => row.status === 'approved' && row.type === 'bonus'), deductions: decimalSum(adjustments as Array<Record<string, unknown>>, 'amount', (row) => row.status === 'approved' && (row.type === 'deduction' || row.type === 'penalty')) },
      advances: { approved: decimalSum(advances as Array<Record<string, unknown>>, 'amount', (row) => row.status === 'approved' || row.status === 'repaid'), outstanding: advances.reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Number(row.repaidAmount)), 0).toFixed(2) },
      payroll: { lines: payroll.length, gross: decimalSum(payroll as Array<Record<string, unknown>>, 'grossAmount'), deductions: decimalSum(payroll as Array<Record<string, unknown>>, 'deductionAmount'), net: decimalSum(payroll as Array<Record<string, unknown>>, 'netAmount'), paid: decimalSum(payroll as Array<Record<string, unknown>>, 'paidAmount'), outstanding: payroll.reduce((sum, row) => sum + Math.max(0, Number(row.netAmount) - Number(row.paidAmount)), 0).toFixed(2) },
    }
    if (searchParams.get('format') === 'csv') {
      const rows = [
        ['التقرير', 'القيمة'], ['الموظفون', result.employees], ['طلبات الإجازة', result.leave.requests], ['أيام إجازة مدفوعة', result.leave.paidDays], ['أيام إجازة غير مدفوعة', result.leave.unpaidDays], ['دقائق إضافي معتمدة', result.overtime.approvedMinutes], ['المكافآت', result.adjustments.bonuses], ['الخصومات', result.adjustments.deductions], ['السلف المعتمدة', result.advances.approved], ['رصيد السلف', result.advances.outstanding], ['إجمالي الرواتب', result.payroll.net], ['الرواتب المدفوعة', result.payroll.paid], ['الرواتب المستحقة', result.payroll.outstanding],
      ]
      return new NextResponse(`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="skoon-hr-report.csv"' } })
    }
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to build HR report' }, { status: 500 })
  }
}
