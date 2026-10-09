'use client'

import { cn } from '@/lib/utils'

/**
 * Switch — accessible on/off toggle built on a real <button role="switch">.
 * Controlled or uncontrolled; no external dependency. RTL-safe thumb travel.
 */

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  'aria-label'?: string
  id?: string
  className?: string
  disabled?: boolean
}

export function Switch({ checked, onChange, className, disabled, id, ...aria }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted',
        className,
      )}
      {...aria}
    >
      <span
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform',
          checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
        )}
        aria-hidden="true"
      />
    </button>
  )
}

