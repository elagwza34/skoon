import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

const prisma = new PrismaClient()

async function main() {
  const targets = await prisma.user.findMany({
    where: { role: { slug: { not: 'owner' } } },
    select: { id: true, email: true },
  })
  const targetIds = targets.map((user) => user.id)

  const result = await prisma.$transaction(async (tx) => {
    const employeeProfiles = await tx.employeeProfile.deleteMany({ where: { userId: { in: targetIds } } })
    const users = await tx.user.deleteMany({ where: { id: { in: targetIds } } })
    return { employeeProfiles: employeeProfiles.count, users: users.count }
  }, { timeout: 30_000 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Public user records were deleted, but Supabase Auth credentials could not be removed: missing server environment variables.')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const authFailures: { id: string; email: string | null; error: string }[] = []
  let authUsers = 0

  for (const user of targets) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) authFailures.push({ id: user.id, email: user.email, error: error.message })
    else authUsers += 1
  }

  console.log(JSON.stringify({ ...result, authUsers, authFailures }, null, 2))
  if (authFailures.length > 0) process.exitCode = 1
}

main().finally(() => prisma.$disconnect())
