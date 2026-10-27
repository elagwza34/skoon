import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { createOvertimePolicy, createOvertimeRequest, listOvertime, OvertimeError } from '@/lib/staff-overtime-write'
export const dynamic = 'force-dynamic'
const fail = (e: unknown) => NextResponse.json({ error: e instanceof OvertimeError ? e.message : 'Unable to process overtime' }, { status: e instanceof OvertimeError ? e.status : 500 })
export async function GET() { const s = await getStaffSession(); if (!s) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { return NextResponse.json(await listOvertime(s)) } catch (e) { return fail(e) } }
export async function POST(req: Request) { const s = await getStaffSession(); if (!s) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { const body = await req.json(); return NextResponse.json(body.kind === 'policy' ? { policy: await createOvertimePolicy(s, body) } : { request: await createOvertimeRequest(s, body) }, { status: 201 }) } catch (e) { return fail(e) } }
