'use client'

import { useActionState, useEffect, useState } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'
import { loginAction, type LoginState } from '@/app/login/actions'

/** Browser-only key for the auto-fill credential store (cleartext JSON). */
const CREDENTIAL_KEY = 'skoon/login-credentials'

/**
 * Staff login form — client component bound to the `loginAction` server action.
 * Shows a generic credential error (anti-enumeration) and an explanatory note
 * when bounced with `reason=unprovisioned` (signed in but no `public.users` row).
 *
 * @remarks
 * Auto-fill: on mount the form re-hydrates from `localStorage` under
 * `skoon/login-credentials` and each keystroke persists `{ email, password }`
 * back to the same key. Design intent: returning staff can log in without
 * retyping. Credentials are stored in cleartext in the browser (intentional —
 * the server-side auth layer remains the security boundary).
 */
export function LoginForm({ next, reason }: { next?: string; reason?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {})

  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CREDENTIAL_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { email?: string; password?: string }
      if (typeof parsed.email === 'string' && parsed.email) setEmail(parsed.email)
      if (typeof parsed.password === 'string' && parsed.password) setPassword(parsed.password)
    } catch {
      // Ignore malformed stored credentials; start with a clean form.
    }
  }, [])

  function persistCredentials() {
    try {
      window.localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ email, password }))
    } catch {
      // Storage full or unavailable — silent no-op.
    }
  }

  function onEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEmail(e.target.value)
    persistCredentials()
  }

  function onPasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value)
    persistCredentials()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Image
            src="/logo.png"
            alt="شعار سكون"
            width={72}
            height={72}
            className="mx-auto h-16 w-16 object-contain"
          />
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
                placeholder="you@skoon.app"
                required
                dir="ltr"
                value={email}
                onChange={onEmailChange}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">كلمة المرور</span>
              <Input
                type="password"
                name="password"
                placeholder="••••••••"
                required
                dir="ltr"
                value={password}
                onChange={onPasswordChange}
              />
            </label>

            {reason === 'unprovisioned' ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                الحساب مسجّل الدخول بس لسه غير مفعّل في النظام — كلّم مدير النظام يفعّل حسابك.
              </p>
            ) : null}

            {reason === 'config' ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                إعدادات الموقع غير مكتملة على السيرفر (متغيّرات بيئة ناقصة). راجع
                إعدادات البيئة ثم أعد المحاولة.
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
