import { financialJson } from '@/lib/financial-json'
import { getStaffSession } from '@/lib/session'
import { decideLeaveRequest, LeaveError } from '@/lib/staff-leave-write'
export const dynamic = 'force-dynamic'
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) { const session = await getStaffSession(); if (!session) return financialJson({ error: 'Not authenticated' }, { status: 401 }); const { id } = await context.params; if (!/^\d+$/.test(id)) return financialJson({ error: 'Invalid leave id' }, { status: 400 }); try { return financialJson({ request: await decideLeaveRequest(session, BigInt(id), await req.json()) }) } catch (e) { return financialJson({ error: e instanceof LeaveError ? e.message : 'Unable to decide leave request' }, { status: e instanceof LeaveError ? e.status : 500 }) } }
