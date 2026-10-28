import { requirePageAccess } from '@/lib/require-page-access'
import { getSettingsSnapshot } from '@/lib/staff-settings'
import { SettingsBoard } from '@/components/settings/settings-board'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

/**
 * Settings â€” server component. Real branch + app_settings rows.
 * Owner/manager can edit the allowlisted keys (server-validated);
 * everything else is read-only.
 */
export default async function SettingsPage() {
  const session = await requirePageAccess('/settings')

  const snapshot = await getSettingsSnapshot(session)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„ÙØ±Ø¹ â€” {snapshot.branchName ?? 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ ÙØ±Ø¹'}</CardTitle>
          <CardDescription>Ù…Ù† Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª â€” Ø§Ù„Ù‚ÙŠÙ… Ø§Ù„ÙØ§Ø±ØºØ© ØªØ¹Ù†ÙŠ Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©:{' '}
            {snapshot.canManage ? 'ÙŠÙ…ÙƒÙ†Ùƒ ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ù…Ø³Ù…ÙˆØ­Ø© Ø£Ø¯Ù†Ø§Ù‡' : 'Ù‚Ø±Ø§Ø¡Ø© ÙÙ‚Ø· Ù„Ø¯ÙˆØ±Ùƒ'} Â·{' '}
            <Badge tone="muted">Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø²Ù…Ù†ÙŠØ©: Africa/Cairo</Badge>
          </p>
        </CardContent>
      </Card>
      <SettingsBoard
        settings={snapshot.settings}
        canManage={snapshot.canManage}
        branchId={snapshot.branchId}
      />
    </div>
  )
}


