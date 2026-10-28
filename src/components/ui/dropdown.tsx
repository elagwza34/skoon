'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Icon, type IconName } from '@/components/ui/icon'

/**
 * Dropdown â€” accessible listbox-style menu built on a real button + role="menu".
 *
 * No external dependency. Handles click-outside, Escape, and basic keyboard
 * roving (ArrowUp/ArrowDown/Enter). RTL-safe via logical utilities only.
 */

export interface DropdownOption {
  value: string
  label: string
  icon?: IconName
  hint?: string
}

export interface DropdownProps {
  /** Optional leading label rendered inside the trigger button. */
  label?: string
  options: DropdownOption[]
  value?: string
  onChange?: (value: string) => void
  className?: string
  /** Accessible name when no visible label is present. */
  ariaLabel?: string
  align?: 'start' | 'end'
}

export function Dropdown({
  label,
  options,
  value,
  onChange,
  className,
  ariaLabel,
  align = 'start',
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const selected = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function choose(i: number) {
    setActive(i)
    onChange?.(options[i].value)
    setOpen(false)
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen((o) => !o)
    }
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel ?? label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-foreground',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        {selected?.icon ? <Icon name={selected.icon} size={18} className="text-muted-foreground" /> : null}
        {label ? <span className="text-muted-foreground">{label}</span> : null}
        <span className="font-medium">{selected?.label}</span>
        <Icon name="chevronDown" size={16} className="text-muted-foreground" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute z-30 mt-2 min-w-48 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {options.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              role="menuitem"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm',
                i === active ? 'bg-accent text-accent-foreground' : 'text-foreground',
              )}
            >
              {opt.icon ? <Icon name={opt.icon} size={16} className="text-muted-foreground" /> : null}
              <span className="flex-1">{opt.label}</span>
              {opt.hint ? <span className="text-xs text-muted-foreground">{opt.hint}</span> : null}
              {opt.value === selected?.value ? <Icon name="check" size={16} className="text-primary" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}


