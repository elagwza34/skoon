'use client'

/**
 * Theme system — Dark is the DEFAULT; Light is opt-in.
 *
 * The mechanism matches `globals.css`: `<html>` with no class = dark (via
 * `:root` tokens); adding the `light` class swaps to light tokens. Preference
 * is persisted to localStorage under `skoon-theme`.
 *
 * To avoid a flash of the wrong theme, `src/app/layout.tsx` injects a tiny
 * inline script that applies the stored class before first paint. This provider
 * then keeps React state in sync.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'skoon-theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  // Hydrate from storage after mount (matches the pre-paint inline script).
  useEffect(() => {
    setThemeState(readStoredTheme())
  }, [])

  // Reflect the theme on <html> and persist it.
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') root.classList.add('light')
    else root.classList.remove('light')
    root.style.colorScheme = theme === 'light' ? 'light' : 'dark'
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  )

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>')
  }
  return ctx
}
