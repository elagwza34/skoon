import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { createLeaveRequest, LeaveError, listLeaveRequests } from '@/lib/staff-leave-write'
export const dynamic = 'force-dynamic'
export async function GET() { const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { return NextResponse.json({ requests: await listLeaveRequests(session) }) } catch (e) { return NextResponse.json({ error: e instanceof LeaveError ? e.message : 'Unable to list leave requests' }, { status: e instanceof LeaveError ? e.status : 500 }) } }
export async function POST(req: Request) { const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { return NextResponse.json({ request: await createLeaveRequest(session, await req.json()) }, { status: 201 }) } catch (e) { return NextResponse.json({ error: e instanceof LeaveError ? e.message : 'Unable to request leave' }, { status: e instanceof LeaveError ? e.status : 500 }) } }
