'use client'

import { useEffect } from 'react'

/**
 * Error boundary for the authenticated staff area.
 *
 * Next only surfaces an opaque "digest" in production, which is useless when
 * debugging a 500 on a remote host. This boundary prints the real error to the
 * browser console AND renders its message. Error messages from our env/Prisma
 * layers are deliberately secret-free (variable NAMES only, never values), so
 * displaying them is safe; any accidental secret is still never logged by us.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[skoon] staff area error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-sm">
        <div className="mb-3 text-3xl" aria-hidden>
          ⚠️
        </div>
        <h1 className="mb-2 text-lg font-bold">حدث خطأ غير متوقع</h1>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          تعذّر تحميل لوحة التحكم. التفاصيل أدناه مفيدة لتشخيص السبب على السيرفر.
        </p>

        <div
          className="mb-5 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-start"
          dir="ltr"
        >
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-destructive">
            {error.message || 'Unknown error'}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        </div>

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
