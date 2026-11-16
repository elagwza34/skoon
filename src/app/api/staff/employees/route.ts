import { financialJson } from '@/lib/financial-json'
import { getStaffSession } from '@/lib/session'
import { EmployeeHrError, listEmployees } from '@/lib/staff-employee-write'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: 'Not authenticated' }, { status: 401 })
  const params = new URL(req.url).searchParams
  const status = params.get('status')
  try {
    const employees = await listEmployees(session, {
      query: params.get('q') ?? undefined,
      status: status === 'active' || status === 'inactive' || status === 'archived' || status === 'terminated' || status === 'all' ? status : undefined,
    })
    return financialJson({ employees })
  } catch (error) {
    if (error instanceof EmployeeHrError) return financialJson({ error: error.message }, { status: error.status })
    return financialJson({ error: 'Unable to list employees' }, { status: 500 })
  }
}
