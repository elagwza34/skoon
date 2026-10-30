import { requirePageAccess } from '@/lib/require-page-access'
import { getCashierInvoices } from '@/lib/staff-invoices'
import { OwnerInvoiceBoard } from '@/components/owner/owner-invoice-board'

export const dynamic = 'force-dynamic'

export default async function OwnerInvoicesPage() {
  const session = await requirePageAccess('/owner/invoices')
  const invoices = await getCashierInvoices(session)
  return (
    <div className="min-h-dvh bg-background p-2 sm:p-3">
      <OwnerInvoiceBoard invoices={invoices} session={{ role: session.role, name: session.name ?? '', branchId: session.branchId ?? null }} />
    </div>
  )
}
