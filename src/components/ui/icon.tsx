import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Unified icon set (single source of truth).
 *
 * Feather/Lucide-style stroke icons on a 24x24 grid, inheriting `currentColor`.
 * Deliberately inline SVG — no icon dependency — so every icon shares the same
 * stroke weight, joins and sizing.
 */

export type IconName =
  | 'dashboard'
  | 'orders'
  | 'pos'
  | 'kitchen'
  | 'waiter'
  | 'tables'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'staff'
  | 'shifts'
  | 'reports'
  | 'settings'
  | 'branch'
  | 'menu'
  | 'sun'
  | 'moon'
  | 'search'
  | 'bell'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'plus'
  | 'minus'
  | 'close'
  | 'trash'
  | 'check'
  | 'clock'
  | 'trendingUp'
  | 'trendingDown'
  | 'flame'
  | 'utensils'
  | 'logout'
  | 'grid'
  | 'sparkles'
  | 'cart'
  | 'phone'
  | 'copy'

export const ICON_PATHS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  orders: (
    <>
      <path d="M9 5h11M9 12h11M9 19h11" />
      <circle cx="4.5" cy="5" r="1.2" />
      <circle cx="4.5" cy="12" r="1.2" />
      <circle cx="4.5" cy="19" r="1.2" />
    </>
  ),
  pos: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h2M11 10h2M15 10h2M7 14h10" />
      <path d="M8 6V4h8v2" />
    </>
  ),
  kitchen: (
    <>
      <path d="M6 3v6a3 3 0 0 0 6 0V3" />
      <path d="M9 12v9" />
      <path d="M17 3c-1.5 2-2 3.5-2 6 0 1.5.5 2.5 2 3v9" />
    </>
  ),
  waiter: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5 21c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
      <path d="M12 10.5V14" />
    </>
  ),
  tables: (
    <>
      <path d="M3 9h18M5 9v11M19 9v11" />
      <path d="M8 9V5h8v4" />
    </>
  ),
  products: (
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  inventory: (
    <>
      <rect x="3" y="4" width="8" height="7" rx="1.5" />
      <rect x="13" y="4" width="8" height="7" rx="1.5" />
      <rect x="8" y="13" width="8" height="7" rx="1.5" />
      <path d="M3 13h5M16 13h5" />
    </>
  ),
  customers: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 6M18 20c0-2-1-3.8-2.5-5" />
    </>
  ),
  staff: (
    <>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M17.5 15.5v4M15.5 17.5h4" />
    </>
  ),
  shifts: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  reports: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M4.5 19.5l2-2M17.5 6.5l2-2" />
    </>
  ),
  branch: (
    <>
      <path d="M4 9h16l-1-5H5L4 9z" />
      <path d="M5 9v11h14V9" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 18l-6-6 6-6" />,
  chevronRight: <path d="M9 18l6-6-6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M18 6L6 18M6 6l12 12" />,
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  trendingUp: (
    <>
      <path d="M23 6l-9.5 9.5-5-5L1 18" />
      <path d="M17 6h6v6" />
    </>
  ),
  trendingDown: (
    <>
      <path d="M23 18l-9.5-9.5-5 5L1 6" />
      <path d="M17 18h6v-6" />
    </>
  ),
  flame: (
    <path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-3.5.5 1.5 1.5 2 2.5 2 1.5 0 2-1 2-2.5 0-2 0-3.5-1-5z" />
  ),
  utensils: (
    <>
      <path d="M4 3v7a3 3 0 0 0 6 0V3M7 10v11" />
      <path d="M17 3c-1.5 2-2 3.5-2 6 0 1.5.5 2.5 2 3v9" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
      <path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M3 4h2l2.3 11a1 1 0 0 0 1 .8h7.6a1 1 0 0 0 1-.8L20 8H6" />
    </>
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" />
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
