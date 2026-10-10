'use client'

import { useEffect } from 'react'

/**
 * Error boundary for the PUBLIC (customer/guest) route group.
 *
 * Without it, a failure on a guest page (e.g. the database being unreachable)
 * surfaces as an opaque Next digest. This renders a readable, secret-free
 * message instead so a guest — and the operator debugging on a phone — can tell
 * what happened.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[skoon] public page error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-sm">
        <div className="mb-3 text-3xl" aria-hidden>⚠️</div>
        <h1 className="mb-2 text-lg font-bold">تعذّر تحميل الصفحة</h1>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          حدث خطأ أثناء تحميل بيانات المنيو. جرّب تحديث الصفحة بعد قليل.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  )
}
