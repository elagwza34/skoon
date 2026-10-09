import { cn } from '@/lib/utils'

/**
 * Avatar — initials-based user chip. Falls back to a neutral glyph.
 * Deterministic accent color derived from the name so the demo looks varied.
 */

export interface AvatarProps {
  name: string
  initials?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
}

const ACCENTS = [
  'bg-primary/15 text-primary',
  'bg-success/15 text-success',
  'bg-warning/15 text-warning',
  'bg-destructive/15 text-destructive',
  'bg-accent text-accent-foreground',
]

function accentFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % ACCENTS.length
  return ACCENTS[h]
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '؟'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return `${parts[0][0]}${parts[1][0]}`
}

export function Avatar({ name, initials, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        accentFor(name),
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials ?? initialsOf(name)}
    </span>
  )
}
