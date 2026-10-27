import { NextResponse } from 'next/server'
import { PayrollError, recordPayrollPayment } from '@/lib/staff-payroll-write'
import { getStaffSession } from '@/lib/session'
export const dynamic = 'force-dynamic'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); const { id } = await params; if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid payroll line id' }, { status: 400 }); try { return NextResponse.json(await recordPayrollPayment(session, BigInt(id), await request.json()), { status: 201 }) } catch (error) { return NextResponse.json({ error: error instanceof PayrollError ? error.message : 'Unable to record payroll payment' }, { status: error instanceof PayrollError ? error.status : 500 }) } }
