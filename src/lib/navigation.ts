import type { IconName } from '@/components/ui/icon'

/**
 * Sidebar navigation model (single source of truth for labels, icons, order).
 *
 * Keeping this separate from the Sidebar component means the Topbar can derive
 * the current page title from the URL, and future i18n only needs to touch here.
 * Badge counts are live data only — no fabricated numbers.
 */

export interface NavItem {
  href: string
  label: string
  icon: IconName
  /** Live badge count (real data). Absent = no badge. */
  badge?: number
}

export interface NavGroup {
  title?: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    items: [{ href: '/dashboard', label: 'لوحة التحكم', icon: 'dashboard' }],
  },
  {
    title: 'العمليات',
    items: [
      { href: '/orders', label: 'الطلبات', icon: 'orders' },
      { href: '/pos', label: 'الكاشير POS', icon: 'pos' },
      { href: '/kitchen', label: 'المطبخ', icon: 'kitchen' },
      { href: '/waiter', label: 'الويتر', icon: 'waiter' },
      { href: '/tables', label: 'الطاولات', icon: 'tables' },
    ],
  },
  {
    title: 'الكتالوج',
    items: [
      { href: '/products', label: 'المنتجات والمنيو', icon: 'products' },
      { href: '/inventory', label: 'المخزون', icon: 'inventory' },
    ],
  },
  {
    title: 'الأشخاص',
    items: [
      { href: '/customers', label: 'العملاء', icon: 'customers' },
      { href: '/staff', label: 'الموظفون والصلاحيات', icon: 'staff' },
    ],
  },
  {
    title: 'الإدارة',
    items: [
      { href: '/shifts', label: 'الورديات', icon: 'shifts' },
      { href: '/reports', label: 'التقارير', icon: 'reports' },
      { href: '/settings', label: 'الإعدادات', icon: 'settings' },
      { href: '/fixed-float', label: 'العهدة الثابتة', icon: 'pos' },
    ],
  },
]

/** Dashboard widgets shown per permission — owner sees all regardless. */
export const DASHBOARD_ALLOWED_NAV = [
  '/dashboard',
  '/orders',
  '/pos',
  '/tables',
  '/reports',
  '/products',
] as const

/**
 * Nav groups filtered to what this role may see. The route→permission map in
 * `@/lib/route-access` is the single source of truth, so the sidebar and the
 * server-side page guard can never disagree.
 */
export function navGroupsFor(
  role: string,
  canSee: (pathname: string) => boolean,
): NavGroup[] {
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => canSee(i.href)) }))
    .filter((g) => g.items.length > 0)
}

const ALL_ITEMS: NavItem[] = navGroups.flatMap((g) => g.items)

/** Title for the current pathname (used by the Topbar). Falls back to a default. */
export function titleForPath(pathname: string): string {
  const exact = ALL_ITEMS.find((i) => i.href === pathname)
  if (exact) return exact.label
  // Match nested routes (e.g. /pos/checkout -> POS).
  const nested = ALL_ITEMS.filter((i) => i.href !== '/').sort(
    (a, b) => b.href.length - a.href.length,
  )
  const match = nested.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
  return match ? match.label : 'سكون'
}
