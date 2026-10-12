import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'

/**
 * Public route group — customer-facing pages (landing, order-type,
 * table select, QR menu). NO sidebar, NO topbar, NO auth requirement.
 * Shares only the design tokens (RTL, theme) with the staff shell.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased" dir="rtl">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="شعار سكون"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
            <span className="text-base font-bold">سكون</span>
          </Link>
          <span className="text-xs text-muted-foreground">اطلب من طاولتك</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">{children}</main>
    </div>
  )
}
