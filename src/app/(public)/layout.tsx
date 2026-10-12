import type { ReactNode } from 'react'

/**
 * Public route group — customer-facing pages (landing, order-type,
 * table select, QR menu). NO sidebar, NO topbar, NO auth requirement.
 * Shares only the design tokens (RTL, theme) with the staff shell.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background font-sans text-foreground antialiased" dir="rtl">
      <main className="mx-auto w-full max-w-3xl px-4">{children}</main>
    </div>
  )
}
