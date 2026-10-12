import { requirePageAccess } from '@/lib/require-page-access'
import { getSettingsSnapshot } from '@/lib/staff-settings'
import { SettingsBoard } from '@/components/settings/settings-board'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

/**
 * Settings — server component. Real branch + app_settings rows.
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
          <CardTitle>إعدادات الفرع — {snapshot.branchName ?? 'لا يوجد فرع'}</CardTitle>
          <CardDescription>من جدول الإعدادات — القيم الفارغة تعني الافتراضي</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            الصلاحية:{' '}
            {snapshot.canManage ? 'يمكنك تعديل الإعدادات المسموحة أدناه' : 'قراءة فقط لدورك'} ·{' '}
            <Badge tone="muted">المنطقة الزمنية: Africa/Cairo</Badge>
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
