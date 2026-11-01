import { NextResponse } from "next/server"
import { getStaffSession } from "@/lib/session"
import { EmployeeHrError, getEmployee } from "@/lib/staff-employee-write"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const { id } = await params
  try {
    const employee = await getEmployee(session, id)
    return NextResponse.json(employee)
  } catch (error) {
    if (error instanceof EmployeeHrError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: "Unable to load employee" }, { status: 500 })
  }
}