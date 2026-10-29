import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { ROLE } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

/**
 * Active branches list for staff assignment dropdowns.
 * Owner sees all branches; manager sees only their own.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER)
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const branches = await prisma.cafeBranch.findMany({
    where: {
      isActive: true,
      ...(session.role === ROLE.OWNER ? {} : { id: BigInt(session.branchId as string) }),
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  })

  return NextResponse.json({
    branches: branches.map((b) => ({ id: b.id.toString(), name: b.name, code: b.code })),
  })
}
