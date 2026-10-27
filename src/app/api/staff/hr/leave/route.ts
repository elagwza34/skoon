import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { createLeaveRequest, LeaveError, listLeaveRequests, listOfficialHolidays, saveOfficialHoliday } from '@/lib/staff-leave-write'
export const dynamic = 'force-dynamic'
function jsonValue(value: unknown): unknown {
  // Preserve Prisma Decimal/Date JSON representations while converting only
  // PostgreSQL bigint identifiers, which JSON cannot encode natively.
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item))
}
export async function GET(req: Request) { const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { return new URL(req.url).searchParams.get('resource') === 'holidays' ? NextResponse.json({ holidays: jsonValue(await listOfficialHolidays(session)) }) : NextResponse.json({ requests: jsonValue(await listLeaveRequests(session)) }) } catch (e) { return NextResponse.json({ error: e instanceof LeaveError ? e.message : 'Unable to list leave records' }, { status: e instanceof LeaveError ? e.status : 500 }) } }
export async function POST(req: Request) { const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { const body = await req.json(); return body.kind === 'holiday' ? NextResponse.json({ holiday: await saveOfficialHoliday(session, body) }, { status: 201 }) : NextResponse.json({ request: await createLeaveRequest(session, body) }, { status: 201 }) } catch (e) { return NextResponse.json({ error: e instanceof LeaveError ? e.message : 'Unable to save leave record' }, { status: e instanceof LeaveError ? e.status : 500 }) } }
