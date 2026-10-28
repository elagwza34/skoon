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
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [attempted, setAttempted] = useState(false)

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
          <Image src="/logo.png" alt="Ø´Ø¹Ø§Ø± Ø³ÙƒÙˆÙ†" width={72} height={72} className="mx-auto h-16 w-16 object-contain" />
          <CardTitle className="text-xl">Ø³ÙƒÙˆÙ† â€” Ø¯Ø®ÙˆÙ„ Ø§Ù„ÙØ±ÙŠÙ‚</CardTitle>
          <CardDescription>Ø§Ø¯Ø®Ù„ Ø¨Ø­Ø³Ø§Ø¨Ùƒ Ù„Ù„ÙˆØµÙˆÙ„ Ù„Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} onSubmit={() => setAttempted(true)} className="flex flex-col gap-3">
            {next ? <input type="hidden" name="next" value={next} /> : null}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø£Ùˆ Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ</span>
              <Input
                type="text"
                name="identifier"
                placeholder="Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø£Ùˆ you@skoon.app"
                required
                dir="ltr"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±</span>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  required
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Ø¥Ø®ÙØ§Ø¡ ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±' : 'Ø¥Ø¸Ù‡Ø§Ø± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±'}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
                </button>
              </div>
            </label>

            {reason === 'unprovisioned' && !attempted ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Ø§Ù„Ø­Ø³Ø§Ø¨ Ù…Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ù„ÙƒÙ†Ù‡ ØºÙŠØ± Ù…ÙØ¹Ù‘Ù„ ÙÙŠ Ø§Ù„Ù†Ø¸Ø§Ù… â€” Ø±Ø§Ø¬Ø¹ Ù…Ø¯ÙŠØ± Ø§Ù„Ù†Ø¸Ø§Ù… Ù„ØªÙØ¹ÙŠÙ„ Ø­Ø³Ø§Ø¨Ùƒ.
              </p>
            ) : null}

            {reason === 'config' ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù…ÙˆÙ‚Ø¹ ØºÙŠØ± Ù…ÙƒØªÙ…Ù„Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø§Ø¯Ù…. Ø±Ø§Ø¬Ø¹ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¨ÙŠØ¦Ø© Ø«Ù… Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.
              </p>
            ) : null}

            {state.error && !(attempted && pending) ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={pending}>
              <Icon name={pending ? 'clock' : 'staff'} size={18} />
              {pending ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¯Ø®ÙˆÙ„â€¦' : 'Ø¯Ø®ÙˆÙ„'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}


