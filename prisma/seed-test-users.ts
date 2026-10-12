// prisma/seed-test-users.ts — TEST-ONLY: 5 staff login accounts, one per role.
//
// Creates Supabase Auth users directly (admin API, email auto-confirmed,
// fixed test password) and links each to a `public.users` row with the right
// role/branch. Idempotent — safe to re-run (resets the test password each run).
//
//   Run: npx tsx prisma/seed-test-users.ts
//
// NEVER run against production. Test emails use the fake domain `test.skoon`
// so they can never collide with real staff accounts.
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

const prisma = new PrismaClient()

const TEST_PASSWORD = 'SkoonTest123'

const TEST_USERS: { email: string; name: string; role: string; branchId: bigint | null }[] = [
  { email: 'owner.test@skoon.local', name: 'مالك تجريبي', role: 'owner', branchId: null },
  { email: 'manager.test@skoon.local', name: 'مدير تجريبي', role: 'manager', branchId: BigInt(1) },
  { email: 'waiter.test@skoon.local', name: 'ويتر تجريبي', role: 'waiter', branchId: BigInt(1) },
  { email: 'kitchen.test@skoon.local', name: 'مطبخ تجريبي', role: 'kitchen', branchId: BigInt(1) },
  { email: 'cashier.test@skoon.local', name: 'كاشير تجريبي', role: 'cashier', branchId: BigInt(1) },
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 })
  const byEmail = new Map((listed?.users ?? []).map((u) => [(u.email ?? '').toLowerCase(), u]))

  const rows: { email: string; role: string; branch: string; auth: string; profile: string }[] = []
  for (const t of TEST_USERS) {
    // 1. Auth identity (create or reset password).
    let authId = byEmail.get(t.email.toLowerCase())?.id
    if (!authId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: t.email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { name: t.name },
      })
      if (error) throw new Error(`createUser ${t.email}: ${error.message}`)
      authId = data.user.id
    } else {
      const { error } = await admin.auth.admin.updateUserById(authId, { password: TEST_PASSWORD })
      if (error) throw new Error(`resetPassword ${t.email}: ${error.message}`)
    }

    // 2. Role row.
    const role = await prisma.role.findUnique({ where: { slug: t.role }, select: { id: true } })
    if (!role) throw new Error(`role missing: ${t.role}`)

    // 3. Profile row — drop any stale row with the same email but a different auth id.
    const stale = await prisma.user.findFirst({ where: { email: t.email }, select: { id: true } })
    if (stale && stale.id !== authId) await prisma.user.delete({ where: { id: stale.id } })
    await prisma.user.upsert({
      where: { id: authId },
      update: { email: t.email, name: t.name, roleId: role.id, branchId: t.branchId, isActive: true, deletedAt: null },
      create: { id: authId, email: t.email, name: t.name, roleId: role.id, branchId: t.branchId, isActive: true },
    })

    rows.push({
      email: t.email,
      role: t.role,
      branch: t.branchId === null ? 'all (owner)' : 'MAIN',
      auth: 'ok',
      profile: 'ok',
    })
  }

  console.log(JSON.stringify({ password: TEST_PASSWORD, users: rows }, null, 2))
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('SEED_TEST_USERS_FAIL:' + (e as Error).message)
    await prisma.$disconnect()
    process.exit(1)
  })
