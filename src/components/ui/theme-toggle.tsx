'use client'

import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/icon'
import { useTheme } from '@/lib/theme'

/**
 * ThemeToggle — visible dark/light switch. Dark is the product default; this
 * button flips to the opposite theme and reflects the choice immediately.
 * Accessible: real <button> with aria-pressed + a clear label.
 */

export interface ThemeToggleProps {
  className?: string
  /** 'icon' shows a compact sun/moon button; 'full' shows an icon + text label. */
  variant?: 'icon' | 'full'
}

export function ThemeToggle({ className, variant = 'icon' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-pressed={!isDark}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-foreground',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        <Icon name={isDark ? 'moon' : 'sun'} size={18} />
        {isDark ? 'الوضع الليلي' : 'الوضع النهاري'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={!isDark}
      aria-label={isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
      title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={20} />
    </button>
  )
}
