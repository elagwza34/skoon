import { ROLE, hasPermission, isOwner } from '@/lib/authz'

/**
 * Route access — the SINGLE SOURCE OF TRUTH for "which staff role may open which
 * page". It drives BOTH surfaces from one map so they can never drift apart:
 *
 *   1. Sidebar visibility  — what nav links a role is offered (UI convenience).
 *   2. Server-side guard   — the (app) layout re-checks this on EVERY request,
 *                            so typing a URL directly is blocked even if the
 *                            link was hidden. (Hiding a link is NOT protection.)
 *
 * IMPORTANT — KEEP THIS MODULE PURE (no `next/headers`, no session, no DB).
 * Client components (AppShell) import `canSeeRoute` from here to filter the
 * sidebar, so anything server-only (cookies/session) must NOT be imported. The
 * session-aware guard lives in `@/lib/require-page-access` (server-only).
 *
 * Operational roles (waiter/kitchen/cashier) land on a full-screen board with no
 * admin sidebar; the owner/manager get the full dashboard. The owner bypasses
 * every check (superuser). Everything is permission-driven, so granting a role a
 * new permission instantly reveals the matching nav item + opens the page.
 */

/** Full-screen operational boards — rendered WITHOUT the admin sidebar. */
export const OPS_BOARDS = ['/waiter', '/kitchen', '/pos', '/cashier'] as const

/** Route prefix → permission slug required to open it. Owner bypasses all. */
const ROUTE_PERMISSION: Record<string, string> = {
  '/orders': 'orders.view',
  '/pos': 'orders.payment',
  '/kitchen': 'orders.kitchen_status',
  '/waiter': 'tables.view',
  '/tables': 'tables.view',
  '/products': 'menu.view',
  '/inventory': 'inventory.view',
  '/customers': 'reports.view',
  '/staff': 'staff.view',
  '/reports': 'reports.view',
  '/settings': 'settings.manage',
  '/fixed-float': 'settings.manage',
  '/shifts': 'orders.view',
  '/cashier': 'orders.payment',
}

const OPERATIONAL: readonly string[] = [ROLE.WAITER, ROLE.KITCHEN, ROLE.CASHIER]

export function isOperationalRole(role: string): boolean {
  return OPERATIONAL.includes(role)
}

export function isOpsPath(pathname: string): boolean {
  return OPS_BOARDS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Admin pages an operational role may still render IN the ops shell.
 * narrowly scoped exception, one route at a time, each with a test:
 * every operational employee must open/close their own shift (/shifts) —
 * their whole station is blocked otherwise. The cashier also renders
 * /cashier (their operational dashboard).
 */
export function canRenderInOpsShell(role: string, pathname: string): boolean {
  if (pathname === '/logout-blocked' || pathname.startsWith('/logout-blocked/')) {
    return isOperationalRole(role)
  }
  if (pathname === '/shifts' || pathname.startsWith('/shifts/')) {
    return role === ROLE.CASHIER || role === ROLE.WAITER || role === ROLE.KITCHEN
  }
  if (role === ROLE.CASHIER && pathname === '/cashier') return true
  if (role === ROLE.CASHIER && (pathname === '/products' || pathname.startsWith('/products/'))) return true
  return false
}

/**
 * The pathname is supplied by middleware. Do not manufacture a redirect from an
 * absent value: redirecting an operational user to their role home with no
 * source-path knowledge can create a same-URL redirect loop.
 */
export function shouldRedirectOperationalUserToHome(role: string, pathname: string): boolean {
  return Boolean(pathname) && isOperationalRole(role) && !isOpsPath(pathname) && !canRenderInOpsShell(role, pathname) && pathname !== homeForRole(role)
}

/**
 * Canonical, role-owned landing route. The role comes exclusively from the
 * trusted server-side staff session; browser-provided roles are never used.
 * Unknown roles deliberately fail closed at login instead of selecting a more
 * privileged default home.
 */
export function resolveRoleHome(role: string): string | null {
  switch (role) {
    case ROLE.OWNER:
      return '/owner'
    case ROLE.MANAGER:
      return '/manager'
    case ROLE.CASHIER:
      return '/cashier'
    case ROLE.KITCHEN:
      return '/kitchen'
    case ROLE.WAITER:
      return '/waiter'
    default:
      return null
  }
}

/** Backward-compatible name for callers; never returns `/dashboard`. */
export function homeForRole(role: string): string {
  return resolveRoleHome(role) ?? '/login?reason=unprovisioned'
}

/** The permission required to open `pathname`, or null if any staff may open it. */
export function permissionForPath(pathname: string): string | null {
  const match = Object.keys(ROUTE_PERMISSION)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return match ? ROUTE_PERMISSION[match] : null
}

/** Pure check: may this role (with these granted permissions) open `pathname`? */
export function canSeeRoute(role: string, permissions: readonly string[], pathname: string): boolean {
  if (isOwner(role)) return true
  if (pathname === '/owner' || pathname.startsWith('/owner/')) return false
  if (pathname === '/manager' || pathname.startsWith('/manager/')) return role === ROLE.MANAGER
  // A role's canonical home must never depend on a mutable permission. If a
  // role was provisioned without one of its operational permissions, sending
  // it away from its own home would produce a same-URL redirect loop. The
  // workspace/API still enforce each mutation's specific permission.
  if (pathname === '/cashier' || pathname.startsWith('/cashier/')) {
    return role === ROLE.CASHIER || hasPermission(permissions, 'orders.payment')
  }
  if (pathname === '/kitchen' || pathname.startsWith('/kitchen/')) return role === ROLE.KITCHEN
  if (pathname === '/waiter' || pathname.startsWith('/waiter/')) return role === ROLE.WAITER
  // An operational employee must always be able to open and close their own
  // attendance/operational shift. Requiring orders.view here creates a redirect
  // loop for a correctly provisioned kitchen user that only has kitchen access:
  // /kitchen -> /shifts -> /kitchen. Financial mutations remain guarded by
  // their own server-side permissions and kitchen shifts never handle cash.
  if (pathname === '/shifts' || pathname.startsWith('/shifts/')) {
    return isOperationalRole(role) || hasPermission(permissions, 'orders.view')
  }
  // The cashier station is the Cashier role's home and is also where that role
  // opens a required operational shift. Requiring the mutable orders.payment
  // permission here can redirect a mis-provisioned cashier from /cashier to
  // their own /cashier home forever. Financial mutations remain separately
  // authorized by their server-side services and still require an open shift.
  if (pathname === '/products' || pathname.startsWith('/products/')) {
    return role === ROLE.MANAGER || role === ROLE.CASHIER
  }
  if (pathname === '/finance' || pathname.startsWith('/finance/')) return false
  // Attendance-correction approval affects payroll inputs and is explicitly
  // Owner-only. Keep this exception in the shared route gate so hidden links
  // and direct URL access cannot diverge.
  if (pathname === '/staff/attendance-corrections' || pathname.startsWith('/staff/attendance-corrections/')) return false
  const required = permissionForPath(pathname)
  if (!required) return true // e.g. /dashboard — open to any authenticated staff
  return hasPermission(permissions, required)
}
