import { financialJson } from '@/lib/financial-json'
import { getStaffSession } from "@/lib/session"
import { EmployeeHrError, reactivateEmployee } from "@/lib/staff-employee-write"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: "Not authenticated" }, { status: 401 })
  const { id } = await params
  try {
    const result = await reactivateEmployee(session, id)
    return financialJson({ ok: true, employeeProfile: result })
  } catch (error) {
    if (error instanceof EmployeeHrError) return financialJson({ error: error.message }, { status: error.status })
    return financialJson({ error: "Unable to reactivate employee" }, { status: 500 })
  }
}