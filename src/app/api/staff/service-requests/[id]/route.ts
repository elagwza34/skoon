import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { actOnServiceRequest, ServiceRequestError } from '@/lib/staff-service-requests'
export const dynamic = 'force-dynamic'
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); const { id } = await context.params; if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid service request id' }, { status: 400 }); try { return NextResponse.json(await actOnServiceRequest(session, BigInt(id), await request.json())) } catch (error) { return NextResponse.json({ error: error instanceof ServiceRequestError ? error.message : 'Unable to update service request' }, { status: error instanceof ServiceRequestError ? error.status : 500 }) } }
