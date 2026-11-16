import { financialJson } from '@/lib/financial-json'
import { createAdjustment, createAdvance, recordAdvanceRepayment, HrFinancialError, listHrFinancials } from '@/lib/staff-hr-financial-write'
import { getStaffSession } from '@/lib/session'
export const dynamic = 'force-dynamic'
const failure = (e: unknown) => financialJson({ error: e instanceof HrFinancialError ? e.message : 'Unable to process HR financial record' }, { status: e instanceof HrFinancialError ? e.status : 500 })
export async function GET() { const s = await getStaffSession(); if (!s) return financialJson({ error: 'Not authenticated' }, { status: 401 }); try { return financialJson(await listHrFinancials(s)) } catch (e) { return failure(e) } }
export async function POST(request: Request) { const s = await getStaffSession(); if (!s) return financialJson({ error: 'Not authenticated' }, { status: 401 }); try { const body = await request.json(); if (body.kind === 'repay_advance') return financialJson({ repayment: await recordAdvanceRepayment(s, body) }, { status: 201 }); if (body.kind === 'adjustment') return financialJson({ adjustment: await createAdjustment(s, body) }, { status: 201 }); if (body.kind === 'advance') return financialJson({ advance: await createAdvance(s, body) }, { status: 201 }); return financialJson({ error: 'Invalid HR financial request' }, { status: 400 }) } catch (e) { return failure(e) } }
