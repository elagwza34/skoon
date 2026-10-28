import type { IconName } from '@/components/ui/icon'
import { homeForRole } from '@/lib/route-access'

export interface NavItem { href: string; label: string; icon: IconName; badge?: number }
export interface NavGroup { title?: string; items: NavItem[] }

/** Central, permission-filtered navigation. Every target is an implemented route. */
export const navGroups: NavGroup[] = [
  { items: [{ href: '/dashboard', label: 'Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…', icon: 'dashboard' }] },
  { title: 'Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª ÙˆØ§Ù„Ø¹Ù…Ù„ÙŠØ§Øª', items: [
    { href: '/orders', label: 'Ø§Ù„Ø·Ù„Ø¨Ø§Øª', icon: 'orders' },
    { href: '/cashier', label: 'Ù„ÙˆØ­Ø© Ø§Ù„ÙƒØ§Ø´ÙŠØ± ÙˆØ§Ù„ÙÙˆØ§ØªÙŠØ±', icon: 'pos' },
    { href: '/tables', label: 'Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª ÙˆØ±Ù…ÙˆØ² QR', icon: 'tables' },
    { href: '/kitchen', label: 'Ù…Ø±Ø§Ù‚Ø¨Ø© Ø§Ù„Ù…Ø·Ø¨Ø®', icon: 'kitchen' },
    { href: '/waiter', label: 'Ù…Ø±Ø§Ù‚Ø¨Ø© Ø§Ù„ÙˆÙŠØªØ± ÙˆØ§Ù„Ø®Ø¯Ù…Ø©', icon: 'waiter' },
  ] },
  { title: 'Ø§Ù„Ù…Ø®Ø²ÙˆÙ† ÙˆØ§Ù„ÙƒØªØ§Ù„ÙˆØ¬', items: [
    { href: '/products', label: 'Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª ÙˆØ§Ù„Ù…Ù†ÙŠÙˆ', icon: 'products' },
    { href: '/inventory', label: 'Ø§Ù„Ù…Ø®Ø²ÙˆÙ† ÙˆØ§Ù„Ø¬Ø±Ø¯ ÙˆØ§Ù„Ù‡Ø¯Ø±', icon: 'inventory' },
  ] },
  { title: 'Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…ÙˆØ§Ø±Ø¯ Ø§Ù„Ø¨Ø´Ø±ÙŠØ©', items: [
    { href: '/staff', label: 'Ø§Ù„Ù…ÙˆØ¸ÙÙˆÙ† ÙˆØ§Ù„ØµÙ„Ø§Ø­ÙŠØ§Øª', icon: 'staff' },
    { href: '/staff/leave', label: 'Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ø¥Ø¬Ø§Ø²Ø§Øª', icon: 'staff' },
    { href: '/staff/attendance-corrections', label: 'ØªØµØ­ÙŠØ­Ø§Øª Ø§Ù„Ø­Ø¶ÙˆØ±', icon: 'staff' },
    { href: '/shifts', label: 'Ø§Ù„ÙˆØ±Ø¯ÙŠØ§Øª ÙˆØ§Ù„Ø­Ø¶ÙˆØ±', icon: 'shifts' },
  ] },
  { title: 'Ø§Ù„ÙƒØªØ§Ù„ÙˆØ¬ ÙˆØ§Ù„Ø¹Ù…Ù„Ø§Ø¡', items: [{ href: '/customers', label: 'Ø³Ø¬Ù„ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡', icon: 'customers' }] },
  { title: 'Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©', items: [
    { href: '/finance', label: 'Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ©', icon: 'reports' },
    { href: '/reports', label: 'Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ± ÙˆØ§Ù„ØªØ­Ù„ÙŠÙ„Ø§Øª', icon: 'reports' },
    { href: '/fixed-float', label: 'Ø§Ù„Ø¹Ù‡Ø¯Ø© Ø§Ù„Ø«Ø§Ø¨ØªØ© ÙˆØ§Ù„ØªØ³ÙˆÙŠØ§Øª', icon: 'pos' },
    { href: '/fixed-float/settlements', label: 'ØªØ³ÙˆÙŠØ§Øª Ø§Ù„Ø³Ù„Ù', icon: 'pos' },
  ] },
  { title: 'Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©', items: [{ href: '/settings', label: 'Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª', icon: 'settings' }] },
]

export const DASHBOARD_ALLOWED_NAV = ['/owner', '/manager', '/orders', '/pos', '/tables', '/reports', '/products'] as const

export function navGroupsFor(role: string, canSee: (pathname: string) => boolean): NavGroup[] {
  const home = homeForRole(role)
  return navGroups
    .map((group) => ({
      ...group,
      // The legacy dashboard route remains a compatibility endpoint only; the
      // sidebar must always expose the canonical owner/manager workspace.
      items: group.items.map((item) => item.href === '/dashboard' ? { ...item, href: home } : item).filter((item) => canSee(item.href)),
    }))
    .filter((group) => group.items.length > 0)
}

const ALL_ITEMS = navGroups.flatMap((group) => group.items)
export function titleForPath(pathname: string): string {
  const item = [...ALL_ITEMS].sort((a, b) => b.href.length - a.href.length).find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
  return item?.label ?? 'Ø³ÙƒÙˆÙ†'
}


