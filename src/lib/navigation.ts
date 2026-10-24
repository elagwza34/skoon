import type { IconName } from '@/components/ui/icon'

export interface NavItem { href: string; label: string; icon: IconName; badge?: number }
export interface NavGroup { title?: string; items: NavItem[] }

/** Central, permission-filtered navigation. Every target is an implemented route. */
export const navGroups: NavGroup[] = [
  { items: [{ href: '/dashboard', label: 'لوحة التحكم', icon: 'dashboard' }] },
  { title: 'المبيعات والعمليات', items: [
    { href: '/orders', label: 'الطلبات والفواتير', icon: 'orders' },
    { href: '/cashier', label: 'لوحة الكاشير والفواتير', icon: 'pos' },
    { href: '/pos', label: 'نقطة البيع', icon: 'pos' },
    { href: '/tables', label: 'الطاولات ورموز QR', icon: 'tables' },
    { href: '/tables/print', label: 'طباعة رموز QR', icon: 'tables' },
    { href: '/kitchen', label: 'المطبخ', icon: 'kitchen' },
    { href: '/waiter', label: 'الويتر والخدمة', icon: 'waiter' },
  ] },
  { title: 'المخزون والكتالوج', items: [
    { href: '/products', label: 'المنتجات والمنيو', icon: 'products' },
    { href: '/inventory', label: 'المخزون والجرد والهدر', icon: 'inventory' },
  ] },
  { title: 'الموارد والأشخاص', items: [
    { href: '/staff', label: 'الموظفون والصلاحيات', icon: 'staff' },
    { href: '/staff/leave', label: 'طلبات الإجازات', icon: 'staff' },
    { href: '/staff/attendance-corrections', label: 'تصحيحات الحضور', icon: 'staff' },
    { href: '/shifts', label: 'الورديات والحضور', icon: 'shifts' },
    { href: '/customers', label: 'سجل العملاء', icon: 'customers' },
  ] },
  { title: 'الإدارة المالية', items: [
    { href: '/reports', label: 'التقارير والتحليلات', icon: 'reports' },
    { href: '/fixed-float', label: 'العهدة الثابتة', icon: 'pos' },
    { href: '/fixed-float/baseline', label: 'خط أساس العهدة', icon: 'pos' },
    { href: '/fixed-float/settlements', label: 'تسويات السلف', icon: 'pos' },
  ] },
  { title: 'الإدارة', items: [{ href: '/settings', label: 'الإعدادات', icon: 'settings' }] },
]

export const DASHBOARD_ALLOWED_NAV = ['/dashboard','/orders','/pos','/tables','/reports','/products'] as const

export function navGroupsFor(_role: string, canSee: (pathname: string) => boolean): NavGroup[] {
  return navGroups.map((group) => ({ ...group, items: group.items.filter((item) => canSee(item.href)) })).filter((group) => group.items.length > 0)
}

const ALL_ITEMS = navGroups.flatMap((group) => group.items)
export function titleForPath(pathname: string): string {
  const item = [...ALL_ITEMS].sort((a,b) => b.href.length-a.href.length).find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
  return item?.label ?? 'سكون'
}
