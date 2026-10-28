import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon, type IconName } from '@/components/ui/icon'

/**
 * StatCard — a single KPI tile (icon, label, value, optional delta/trend, hint).
 * Purely presentational; the value string is pre-formatted by the caller so
 * number/locale formatting stays in the format helpers.
 */

export interface StatCardProps {
  label: string
  value: string
  icon: IconName
  /** Signed change, e.g. +12.4% — rendered with an up/down arrow + tone. */
  delta?: string
  deltaDirection?: 'up' | 'down' | 'flat'
  hint?: string
  className?: string
  children?: ReactNode
}

const DELTA_TONE: Record<NonNullable<StatCardProps['deltaDirection']>, string> = {
  up: 'text-success',
  down: 'text-destructive',
  flat: 'text-muted-foreground',
}

export function StatCard({
  label,
  value,
  icon,
  delta,
  deltaDirection = 'flat',
  hint,
  className,
  children,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-sm',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon name={icon} size={22} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-sm font-medium',
              DELTA_TONE[deltaDirection],
            )}
          >
            <Icon
              name={deltaDirection === 'down' ? 'trendingDown' : 'trendingUp'}
              size={16}
            />
            {delta}
          </span>
        ) : null}
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        {children}
      </div>
    </div>
  )
}
