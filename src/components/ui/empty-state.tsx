import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Icon, type IconName } from '@/components/ui/icon'

/**
 * EmptyState â€” friendly placeholder for empty / no-results / error surfaces.
 * Keeps the preview honest: search "no results" is distinct from a real error.
 */

export interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon = 'sparkles', title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon name={icon} size={24} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}


