import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Icon, type IconName } from '@/components/ui/icon'

/**
 * Input — themed text field with an optional leading icon and RTL-safe padding.
 * Uses logical padding (ps/pe) so it reads correctly in RTL and LTR.
 */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: IconName
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, type = 'text', ...props }, ref) => {
    if (icon) {
      return (
        <div className="relative">
          <Icon
            name={icon}
            size={18}
            className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted-foreground"
          />
          <input
            ref={ref}
            type={type}
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-background py-2 pe-3 ps-10',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
            {...props}
          />
        </div>
      )
    }
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
          'text-sm text-foreground placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'
