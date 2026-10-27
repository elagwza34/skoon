import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { ROLE, type RoleSlug } from '@/lib/authz'

/**
 * Server-side session + authorization.
 *
 * MODEL: Supabase Auth owns *identity* (who you are — email/password, session
 * cookies). Prisma (DIRECT_URL) owns *authorization* (role, branch, permissions)
 * via the trusted `public.users` row keyed by the Supabase user id. We NEVER
 * read role from JWT claims/user_metadata — only from the DB row we control.
 *
 * The Supabase server client here uses the ANON key + user session cookies, so
 * it only ever acts on behalf of the signed-in user and respects RLS. Privileged
 * reads (role/branch) go through Prisma DIRECT_URL on the trusted server.
 */

export interface StaffSession {
  /** Supabase auth user id (== public.users.id). */
  id: string
  email: string | null
  name: string
  role: RoleSlug
  /** null == Owner (cross-branch access). */
  branchId: string | null
  permissions: string[]
}

/** Low-level: Supabase identity or null (no throw). */
export async function getAuthUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

/**
 * Resolve the full staff session, or null if not signed in OR signed in but with
 * no active public.users row (e.g. not yet provisioned). Never throws for the
 * "not signed in" case so callers can branch on null.
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  const user = await getAuthUser()
  if (!user) return null

  const row = await prisma.user.findFirst({
    where: { id: user.id, isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      branchId: true,
      role: {
        select: {
          slug: true,
          permissions: { select: { permission: { select: { slug: true } } } },
        },
      },
    },
  })
  if (!row) return bootstrapFirstOwner(user)

  const slug = row.role.slug as RoleSlug
  return {
    id: row.id,
    email: row.email ?? user.email ?? null,
    name: row.name,
    role: slug,
    branchId: row.branchId?.toString() ?? null,
    permissions: row.role.permissions.map((rp) => rp.permission.slug),
  }
}

type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>

/**
 * FIRST-RUN OWNER BOOTSTRAP — bounded, documented, self-closing.
 *
 * When `public.users` is COMPLETELY empty, the first confirmed Supabase auth
 * user is provisioned as Owner (`branchId = NULL` = cross-branch, per authz).
 * This window closes permanently the moment any user row exists; every later
 * account must be provisioned by the trusted server-side flow.
 *
 * Safety preconditions:
 *  - Public sign-up is DISABLED in Supabase Auth (docs/OWNER-PROVISIONING.md),
 *    so only operator-created accounts can authenticate at all.
 *  - The auth user must have a confirmed email.
 *  - `count > 0` → no-op (never overwrites/escalates an existing install).
 */
async function bootstrapFirstOwner(user: AuthUser): Promise<StaffSession | null> {
  if (!user.email || !user.email_confirmed_at) return null

  try {
    const [count, ownerRole] = await Promise.all([
      prisma.user.count(),
      prisma.role.findUnique({ where: { slug: ROLE.OWNER }, select: { id: true } }),
    ])
    if (count > 0 || !ownerRole) return null

    const meta = (user.user_metadata ?? {}) as { full_name?: unknown; name?: unknown }
    const name =
      (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
      (typeof meta.name === 'string' && meta.name.trim()) ||
      user.email.split('@')[0]

    const created = await prisma.user.create({
      data: { id: user.id, roleId: ownerRole.id, name, email: user.email, branchId: null, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        branchId: true,
        role: { select: { permissions: { select: { permission: { select: { slug: true } } } } } },
      },
    })

    return {
      id: created.id,
      email: created.email ?? user.email,
      name: created.name,
      role: ROLE.OWNER,
      branchId: null, // owner = cross-branch
      permissions: created.role.permissions.map((rp) => rp.permission.slug),
    }
  } catch {
    // Unique-violation race (another request provisioned first) or transient DB
    // error — either way this request simply proceeds as "not provisioned".
    return null
  }
}

/** Require an authenticated staff session; throws a redirect-friendly error. */
export async function requireStaffSession(): Promise<StaffSession> {
  const session = await getStaffSession()
  if (!session) {
    // Thrown and caught by middleware/layout to bounce to /login.
    throw new NotAuthenticatedError()
  }
  return session
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'NotAuthenticatedError'
  }
}

/** True if the staff member may access the given branch. */
export function staffCanAccessBranch(session: StaffSession, branchId: bigint | number | string): boolean {
  if (session.role === ROLE.OWNER) return true
  if (session.branchId === null) return false
  return session.branchId === branchId.toString()
}
