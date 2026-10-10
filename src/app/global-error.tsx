'use client'

import { useEffect } from 'react'

/**
 * Global error boundary — the LAST line of defence.
 *
 * Unlike `app/error.tsx` (which only covers its own route segment), this catches
 * anything that escapes the root layout itself and replaces the whole document.
 * Without it, a failure during root-module evaluation or layout rendering dies as
 * an opaque 500 digest with nothing to read in the browser.
 *
 * Error messages produced by our env/Prisma layers are secret-free (variable
 * names and driver messages only, never values), so showing them is safe.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[skoon] global error:', error)
  }, [error])

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#1a1a1f',
          color: '#f5f5f7',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ maxWidth: '32rem', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }} aria-hidden>
            ⚠️
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: '1.25rem' }}>
            عذراً، الموقع لا يستطيع التحميل الآن
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: '0.9rem', opacity: 0.7, lineHeight: 1.6 }}>
            حدث خطأ في الخادم. التفاصيل التقنية أدناه مفيدة للتشخيص.
          </p>
          <pre
            dir="ltr"
            style={{
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'rgba(255,80,80,0.08)',
              border: '1px solid rgba(255,80,80,0.25)',
              borderRadius: '10px',
              padding: '12px',
              fontSize: '0.75rem',
              color: '#ff9b9b',
              maxHeight: '180px',
              overflow: 'auto',
            }}
          >
            {error.message || 'Unknown error'}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '20px',
              padding: '10px 24px',
              borderRadius: '10px',
              border: 'none',
              background: '#7c6cf0',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  )
}
