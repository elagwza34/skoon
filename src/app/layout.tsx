import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import { ThemeProvider } from '@/lib/theme'
import { AuthExpiryGuard } from '@/components/auth/auth-expiry-guard'
import './globals.css'

// Cairo is bundled from the upstream Google Fonts OFL source so production
// builds never need outbound access to fonts.googleapis.com.
const cairo = localFont({
  src: '../../public/fonts/Cairo-Variable.ttf',
  display: 'swap',
  weight: '200 1000',
  style: 'normal',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://sokooncafe.com'),
  title: 'سكون — علامة تجارية للكافيه',
  description: 'علامة تجارية للكافيه',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'سكون — القهوة، نكهة الحماس',
    description: 'اعرف منيو سكون واطلب من طاولتك بمسح رمز QR.',
    images: ['/logo.png'],
    locale: 'ar_EG',
    type: 'website',
  },
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
      <body suppressHydrationWarning className={`${cairo.className} min-h-dvh bg-background font-sans text-foreground antialiased`}>
        <ThemeProvider><AuthExpiryGuard />{children}</ThemeProvider>
      </body>
    </html>
  )
}
