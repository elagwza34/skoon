import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { listServiceRequests, ServiceRequestError } from '@/lib/staff-service-requests'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) { const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); const q = new URL(request.url).searchParams; try { return NextResponse.json({ requests: await listServiceRequests(session, { status: q.get('status') ?? undefined, type: q.get('type') ?? undefined, priority: q.get('priority') ?? undefined, table: q.get('table') ?? undefined, assignedTo: q.get('assignedTo') ?? undefined, from: q.get('from') ?? undefined }) }) } catch (error) { return NextResponse.json({ error: error instanceof ServiceRequestError ? error.message : 'Unable to list service requests' }, { status: error instanceof ServiceRequestError ? error.status : 500 }) } }
