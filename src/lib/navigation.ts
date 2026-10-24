import type { IconName } from '@/components/ui/icon'

export interface NavItem { href: string; label: string; icon: IconName; badge?: number }
export interface NavGroup { title?: string; items: NavItem[] }

/** Central, permission-filtered navigation. Every target is an implemented route. */
export const navGroups: NavGroup[] = [
  { items: [{ href: '/dashboard', label: 'لوحة التحكم', icon: 'dashboard' }] },
  { title: 'المبيعات والعمليات', items: [
    { href: '/orders', label: 'الطلبات', icon: 'orders' },
    { href: '/cashier', label: 'لوحة الكاشير والفواتير', icon: 'pos' },
    { href: '/tables', label: 'الطاولات ورموز QR', icon: 'tables' },
    { href: '/kitchen', label: 'مراقبة المطبخ', icon: 'kitchen' },
    { href: '/waiter', label: 'مراقبة الويتر والخدمة', icon: 'waiter' },
  ] },
  { title: 'المخزون والكتالوج', items: [
    { href: '/products', label: 'المنتجات والمنيو', icon: 'products' },
    { href: '/inventory', label: 'المخزون والجرد والهدر', icon: 'inventory' },
  ] },
  { title: 'إدارة الموارد البشرية', items: [
    { href: '/staff', label: 'الموظفون والصلاحيات', icon: 'staff' },
    { href: '/staff/leave', label: 'طلبات الإجازات', icon: 'staff' },
    { href: '/staff/attendance-corrections', label: 'تصحيحات الحضور', icon: 'staff' },
    { href: '/shifts', label: 'الورديات والحضور', icon: 'shifts' },
  ] },
  { title: 'الكتالوج والعملاء', items: [{ href: '/customers', label: 'سجل العملاء', icon: 'customers' }] },
  { title: 'الإدارة المالية', items: [
    { href: '/finance', label: 'الإدارة المالية', icon: 'reports' },
    { href: '/reports', label: 'التقارير والتحليلات', icon: 'reports' },
    { href: '/fixed-float', label: 'العهدة الثابتة والتسويات', icon: 'pos' },
    { href: '/fixed-float/settlements', label: 'تسويات السلف', icon: 'pos' },
  ] },
  { title: 'الإدارة', items: [{ href: '/settings', label: 'الإعدادات', icon: 'settings' }] },
]

export const DASHBOARD_ALLOWED_NAV = ['/dashboard', '/orders', '/pos', '/tables', '/reports', '/products'] as const

export function navGroupsFor(_role: string, canSee: (pathname: string) => boolean): NavGroup[] {
  return navGroups.map((group) => ({ ...group, items: group.items.filter((item) => canSee(item.href)) })).filter((group) => group.items.length > 0)
}

const ALL_ITEMS = navGroups.flatMap((group) => group.items)
export function titleForPath(pathname: string): string {
  const item = [...ALL_ITEMS].sort((a, b) => b.href.length - a.href.length).find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
  return item?.label ?? 'سكون'
}
