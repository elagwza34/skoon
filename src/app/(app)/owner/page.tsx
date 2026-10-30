import { CanonicalDashboardPage } from '../admin-home'
import { requirePageAccess } from '@/lib/require-page-access'
import { getCashierInvoices } from '@/lib/staff-invoices'
import { OwnerInvoiceBoard } from '@/components/owner/owner-invoice-board'

export default async function OwnerPage() {
  const session = await requirePageAccess('/owner')
  const invoices = await getCashierInvoices(session)
  return (
    <div className="min-h-dvh bg-background p-2 sm:p-3">
      <CanonicalDashboardPage pathname="/owner" />
      <OwnerInvoiceBoard invoices={invoices} session={{ role: session.role, name: session.name ?? '', branchId: session.branchId ?? null }} />
    </div>
  )
}
