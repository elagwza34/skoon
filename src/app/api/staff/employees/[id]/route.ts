import { financialJson } from '@/lib/financial-json'
import { getStaffSession } from "@/lib/session"
import { EmployeeHrError, getEmployee, updateEmployeeProfile } from "@/lib/staff-employee-write"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: "Not authenticated" }, { status: 401 })
  const { id } = await params
  try {
    const employee = await getEmployee(session, id)
    return financialJson(employee)
  } catch (error) {
    if (error instanceof EmployeeHrError) return financialJson({ error: error.message }, { status: error.status })
    return financialJson({ error: "Unable to load employee" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: 'Not authenticated' }, { status: 401 })
  let body: unknown
  try { body = await req.json() }
  catch { return financialJson({ error: 'Invalid request body' }, { status: 400 }) }
  const { id } = await params
  try {
    return financialJson(await updateEmployeeProfile(session, id, body))
  } catch (error) {
    if (error instanceof EmployeeHrError) return financialJson({ error: error.message }, { status: error.status })
    return financialJson({ error: 'Unable to update employee' }, { status: 500 })
  }
}
