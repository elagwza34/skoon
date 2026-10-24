'use client'

import { useActionState, useEffect, useState } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/ui/icon'
import { loginAction, type LoginState } from '@/app/login/actions'
import { clearLegacyLoginCredentials } from '@/lib/auth/login-storage'

/**
 * Staff login form bound to the login server action. It deliberately leaves
 * password storage to the browser or the user's password manager.
 */
export function LoginForm({ next, reason }: { next?: string; reason?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {})
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    try {
      clearLegacyLoginCredentials(window.localStorage)
    } catch {
      // Storage can be unavailable in private or restricted browsing modes.
    }
  }, [])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Image src="/logo.png" alt="شعار سكون" width={72} height={72} className="mx-auto h-16 w-16 object-contain" />
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
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {reason === 'unprovisioned' ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                الحساب مسجّل الدخول لكنه غير مفعّل في النظام — راجع مدير النظام لتفعيل حسابك.
              </p>
            ) : null}

            {reason === 'config' ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                إعدادات الموقع غير مكتملة على الخادم. راجع إعدادات البيئة ثم أعد المحاولة.
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
