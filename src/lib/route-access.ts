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
  if (pathname === '/shifts' || pathname.startsWith('/shifts/')) {
    return role === ROLE.CASHIER || role === ROLE.WAITER || role === ROLE.KITCHEN
  }
  if (role === ROLE.CASHIER && pathname === '/cashier') return true
  return false
}

/** Home screen per role — operational roles land on their dedicated board. */
export function homeForRole(role: string): string {
  if (role === ROLE.WAITER) return '/waiter'
  if (role === ROLE.KITCHEN) return '/kitchen'
  if (role === ROLE.CASHIER) return '/cashier'
  return '/dashboard'
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
  const required = permissionForPath(pathname)
  if (!required) return true // e.g. /dashboard — open to any authenticated staff
  return hasPermission(permissions, required)
}
