import { NextResponse } from "next/server"
import { getStaffSession } from "@/lib/session"
import { EmployeeHrError, archiveEmployee } from "@/lib/staff-employee-write"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const reason = typeof body.reason === "string" ? body.reason : ""
    const result = await archiveEmployee(session, id, reason)
    return NextResponse.json({ ok: true, employeeProfile: result })
  } catch (error) {
    if (error instanceof EmployeeHrError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: "Unable to archive employee" }, { status: 500 })
  }
}