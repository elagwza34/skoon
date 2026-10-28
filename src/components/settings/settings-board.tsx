'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumber } from '@/lib/format'
import type { BranchSetting } from '@/lib/staff-settings'

/**
 * Settings board â€” editable allowlisted keys for owner/manager.
 * Unknown keys are shown read-only; all validation happens server-side.
 */

type FieldKind = 'string' | 'number' | 'boolean'

const EDITABLE: Record<string, { label: string; kind: FieldKind }> = {
  currency: { label: 'Ø§Ù„Ø¹Ù…Ù„Ø©', kind: 'string' },
  tax_name: { label: 'Ø§Ø³Ù… Ø§Ù„Ø¶Ø±ÙŠØ¨Ø©', kind: 'string' },
  tax_rate: { label: 'Ù†Ø³Ø¨Ø© Ø§Ù„Ø¶Ø±ÙŠØ¨Ø© (%)', kind: 'number' },
  tax_enabled: { label: 'ØªÙØ¹ÙŠÙ„ Ø§Ù„Ø¶Ø±ÙŠØ¨Ø©', kind: 'boolean' },
  store_name: { label: 'Ø§Ø³Ù… Ø§Ù„Ù…Ø­Ù„', kind: 'string' },
  phone: { label: 'Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ', kind: 'string' },
}

export function SettingsBoard({
  settings,
  canManage,
  branchId,
}: {
  settings: BranchSetting[]
  canManage: boolean
  branchId: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Seed editable fields from existing rows; missing keys start empty.
  const initial: Record<string, string> = {}
  for (const key of Object.keys(EDITABLE)) {
    initial[key] = settings.find((s) => s.key === key)?.value ?? ''
  }
  const [draft, setDraft] = useState<Record<string, string>>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const readOnly = settings.filter((s) => !(s.key in EDITABLE))

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      // Send only keys whose value actually changed.
      const values: Record<string, string | number | boolean> = {}
      for (const [key, def] of Object.entries(EDITABLE)) {
        const raw = (draft[key] ?? '').trim()
        const original = settings.find((s) => s.key === key)?.value ?? ''
        if (raw === original || raw === '') continue
        if (def.kind === 'number') values[key] = Number(raw)
        else if (def.kind === 'boolean') values[key] = raw === 'true'
        else values[key] = raw
      }
      if (Object.keys(values).length === 0) {
        setError('Ù„Ø§ ØªÙˆØ¬Ø¯ ØªØºÙŠÙŠØ±Ø§Øª Ù„Ø­ÙØ¸Ù‡Ø§')
        return
      }
      const res = await fetch('/api/staff/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branchId: branchId ?? undefined, values }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª')
      setSuccess(`ØªÙ… Ø­ÙØ¸ ${data.updated?.length ?? 0} Ø¥Ø¹Ø¯Ø§Ø¯`)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-5 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}
      {success ? (
        <Card className="border-success/40">
          <CardContent className="pt-5 text-sm text-success">{success}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„ØªØ¹Ø¯ÙŠÙ„</CardTitle>
          <CardDescription>ØªÙØ­ÙØ¸ Ø¹Ù„Ù‰ Ù…Ø³ØªÙˆÙ‰ Ø§Ù„ÙØ±Ø¹ â€” Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ù‚ÙŠÙ… ÙŠØªÙ… Ø¹Ù„Ù‰ Ø§Ù„Ø®Ø§Ø¯Ù…</CardDescription>
        </CardHeader>
        <CardContent>
          {settings.length === 0 && !canManage ? (
            <EmptyState icon="settings" title="Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ù…Ø®ØµØµØ©" description="ÙŠÙØ³ØªØ®Ø¯Ù… Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ Ù„ÙƒÙ„ Ø§Ù„Ù…ÙØ§ØªÙŠØ­." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(EDITABLE).map(([key, def]) => (
                <label key={key} className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">{def.label}</span>
                  {canManage ? (
                    def.kind === 'boolean' ? (
                      <select
                        value={draft[key] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        className="h-10 rounded-lg border border-border bg-background px-3 text-foreground"
                      >
                        <option value="">Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ</option>
                        <option value="true">Ù…ÙØ¹Ù‘Ù„</option>
                        <option value="false">Ù…Ø¹Ø·Ù‘Ù„</option>
                      </select>
                    ) : (
                      <Input
                        value={draft[key] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        inputMode={def.kind === 'number' ? 'decimal' : 'text'}
                        placeholder="Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ"
                      />
                    )
                  ) : (
                    <span className="text-foreground">
                      {settings.find((s) => s.key === key)?.value ?? 'â€”'}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
          {canManage ? (
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={save} disabled={saving}>
                <Icon name="check" size={16} />
                {saving ? 'Ø¬Ø§Ø±Ù Ø§Ù„Ø­ÙØ¸â€¦' : 'Ø­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª'}
              </Button>
              <span className="text-xs text-muted-foreground">Ø§Ù„Ù‚ÙŠÙ… Ø§Ù„ÙØ§Ø±ØºØ© = Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {readOnly.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø£Ø®Ø±Ù‰ (Ù„Ù„Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø·)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border/60">
              {readOnly.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-mono text-foreground" dir="ltr">{s.key}</span>
                  <span className="text-muted-foreground">{s.value ?? 'â€”'}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Ø¹Ø¯Ø¯ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©: {formatNumber(settings.length)} Â· Ø§Ù„Ù…ÙØ§ØªÙŠØ­ Ø§Ù„Ù…Ø¹Ø¯Ù„Ø© Ù…Ø³Ù…ÙˆØ­Ø© ÙÙ‚Ø·ØŒ ÙˆØ£ÙŠ Ù…ÙØªØ§Ø­ Ø¢Ø®Ø±
        Ù…Ø±ÙÙˆØ¶ Ù…Ù† Ø§Ù„Ø®Ø§Ø¯Ù….
      </p>
    </div>
  )
}


