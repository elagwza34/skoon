import { financialJson } from '@/lib/financial-json'
import { HrDocumentError, signEmployeeDocument } from '@/lib/staff-hr-documents'
import { getStaffSession } from '@/lib/session'
export const dynamic = 'force-dynamic'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const session = await getStaffSession(); if (!session) return financialJson({ error: 'Not authenticated' }, { status: 401 }); const { id } = await params; if (!/^\d+$/.test(id)) return financialJson({ error: 'Invalid document id' }, { status: 400 }); try { return financialJson(await signEmployeeDocument(session, BigInt(id))) } catch (error) { return financialJson({ error: error instanceof HrDocumentError ? error.message : 'Unable to open private document' }, { status: error instanceof HrDocumentError ? error.status : 500 }) } }
