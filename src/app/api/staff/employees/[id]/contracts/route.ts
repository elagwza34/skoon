import { financialJson } from '@/lib/financial-json'
import { getStaffSession } from '@/lib/session'
import { addEmployeeContract, EmployeeHrError } from '@/lib/staff-employee-write'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: 'Not authenticated' }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch { return financialJson({ error: 'Invalid request body' }, { status: 400 }) }
  const { id } = await ctx.params
  try {
    return financialJson(await addEmployeeContract(session, id, body), { status: 201 })
  } catch (error) {
    if (error instanceof EmployeeHrError) return financialJson({ error: error.message }, { status: error.status })
    return financialJson({ error: 'Unable to create contract' }, { status: 500 })
  }
}
