'use client'

import { useActionState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'
import { loginAction, type LoginState } from '@/app/login/actions'

/**
 * Staff login form — client component bound to the `loginAction` server action.
 * Shows a generic credential error (anti-enumeration) and an explanatory note
 * when bounced with `reason=unprovisioned` (signed in but no `public.users` row).
 */
export function LoginForm({ next, reason }: { next?: string; reason?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {})

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-3xl text-primary-foreground">
            ☕
          </span>
          <CardTitle className="text-xl">سكون — دخول الفريق</CardTitle>
          <CardDescription>ادخل بحسابك للوصول للوحة التحكم</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-3">
            {next ? <input type="hidden" name="next" value={next} /> : null}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">البريد الإلكتروني</span>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@skoon.app"
                required
                dir="ltr"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">كلمة المرور</span>
              <Input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
                dir="ltr"
              />
            </label>

            {reason === 'unprovisioned' ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                الحساب مسجّل الدخول بس لسه غير مفعّل في النظام — كلّم مدير النظام يفعّل حسابك.
              </p>
            ) : null}

            {state.error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={pending}>
              <Icon name={pending ? 'clock' : 'staff'} size={18} />
              {pending ? 'جاري الدخول…' : 'دخول'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
