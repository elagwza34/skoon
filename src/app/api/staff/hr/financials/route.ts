import { NextResponse } from 'next/server'
import { createAdjustment, createAdvance, HrFinancialError, listHrFinancials } from '@/lib/staff-hr-financial-write'
import { getStaffSession } from '@/lib/session'
export const dynamic = 'force-dynamic'
const failure = (e: unknown) => NextResponse.json({ error: e instanceof HrFinancialError ? e.message : 'Unable to process HR financial record' }, { status: e instanceof HrFinancialError ? e.status : 500 })
export async function GET() { const s = await getStaffSession(); if (!s) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { return NextResponse.json(await listHrFinancials(s)) } catch (e) { return failure(e) } }
export async function POST(request: Request) { const s = await getStaffSession(); if (!s) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); try { const body = await request.json(); if (body.kind === 'adjustment') return NextResponse.json({ adjustment: await createAdjustment(s, body) }, { status: 201 }); if (body.kind === 'advance') return NextResponse.json({ advance: await createAdvance(s, body) }, { status: 201 }); return NextResponse.json({ error: 'Invalid HR financial request' }, { status: 400 }) } catch (e) { return failure(e) } }
