import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { inviteStaff } from '../src/lib/staff-provision-write'
import { ROLE } from '../src/lib/authz'

const prisma = new PrismaClient()

async function main() {
  const [owner, branch] = await Promise.all([
    prisma.user.findFirst({ where: { isActive: true, deletedAt: null, role: { slug: ROLE.OWNER } }, select: { id: true, name: true, email: true } }),
    prisma.cafeBranch.findFirst({ where: { isActive: true }, select: { id: true } }),
  ])
  if (!owner || !branch) throw new Error('An active owner and branch are required for the provisioning verification.')

  const username = `verify${Date.now().toString().slice(-10)}`
  let createdId: string | null = null

  try {
    const created = await inviteStaff({ id: owner.id, name: owner.name, email: owner.email, role: ROLE.OWNER, branchId: null, permissions: [] }, {
      username,
      name: 'Provisioning verification',
      role: ROLE.CASHIER,
      branchId: branch.id.toString(),
      accountMode: 'password',
      permanentPassword: 'VerifyStaff#2026',
      employmentType: 'verification',
    })
    createdId = created.id

    const row = await prisma.user.findUnique({ where: { id: created.id }, select: { id: true, employeeProfile: { select: { id: true } } } })
    if (!row?.employeeProfile) throw new Error('Account was created without the required public.users row and HR profile.')
    console.log(JSON.stringify({ created: true, user: Boolean(row), employeeProfile: Boolean(row.employeeProfile) }))
  } finally {
    if (createdId) {
      await prisma.$transaction(async (tx) => {
        await tx.employeeProfile.deleteMany({ where: { userId: createdId! } })
        await tx.user.deleteMany({ where: { id: createdId! } })
      })
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !serviceKey) throw new Error('Verification cleanup could not access Supabase Auth.')
      const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
      const { error } = await admin.auth.admin.deleteUser(createdId)
      if (error) throw error
      console.log(JSON.stringify({ cleanup: 'complete' }))
    }
  }
}

main()
  .finally(() => prisma.$disconnect())
