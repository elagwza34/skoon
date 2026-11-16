import { financialJson } from '@/lib/financial-json'
import { getStaffSession } from "@/lib/session"
import { EmployeeHrError, terminateEmployee } from "@/lib/staff-employee-write"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: "Not authenticated" }, { status: 401 })
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const reason = typeof body.reason === "string" ? body.reason : ""
    const result = await terminateEmployee(session, id, reason)
    return financialJson({ ok: true, employeeProfile: result })
  } catch (error) {
    if (error instanceof EmployeeHrError) return financialJson({ error: error.message }, { status: error.status })
    return financialJson({ error: "Unable to terminate employee" }, { status: 500 })
  }
}