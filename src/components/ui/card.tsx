import { cn } from '@/lib/utils'

/** Card — the primary surface container (surface, header, title, content, footer). */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-w-0 flex-col gap-1 p-4 pb-3 sm:p-5 sm:pb-3', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('min-w-0 break-words text-base font-semibold leading-tight tracking-tight', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-w-0 items-center p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />
}
