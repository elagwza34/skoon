import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { ThemeProvider } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'سكون — نظام إدارة الكافيه',
  description: 'لوحة تحكم ونقاط بيع لنظام إدارة الكافيه',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1f' },
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
  ],
}

// Runs before first paint to apply the saved theme and avoid a flash.
// Must stay in sync with src/lib/theme.tsx (key 'skoon-theme', class 'light').
const themeInitScript = `(function(){try{var t=localStorage.getItem('skoon-theme');var r=document.documentElement;if(t==='light'){r.classList.add('light');r.style.colorScheme='light';}else{r.classList.remove('light');r.style.colorScheme='dark';}}catch(e){}})();`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
