import { NextResponse } from 'next/server'
import { createPublicServiceRequest, ServiceRequestError } from '@/lib/staff-service-requests'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) { try { return NextResponse.json(await createPublicServiceRequest(await request.json()), { status: 201 }) } catch (error) { return NextResponse.json({ error: error instanceof ServiceRequestError ? error.message : 'Unable to create service request' }, { status: error instanceof ServiceRequestError ? error.status : 500 }) } }
