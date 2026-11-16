import type { ReactNode } from 'react'

/**
 * Public route group — customer-facing pages (landing, order-type,
 * table select, QR menu). NO sidebar, NO topbar, NO header, NO auth requirement.
 * Shares only the design tokens (RTL, theme) with the staff shell.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased" dir="rtl">
      <a href="#main-content" className="skip-link">تخطّي التنقل إلى المحتوى</a>
      <div id="main-content" tabIndex={-1} className="w-full pb-24 pt-4">{children}</div>
    </div>
  )
}
