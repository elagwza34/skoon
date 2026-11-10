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
      <div className="mt-6">
        <a
          href="/owner/qr-tables"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#241B17] text-[#FFFCF8] font-semibold text-sm hover:bg-[#B98757] hover:text-[#241B17] transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">qr_code</span>
          رموز QR للطاولات
        </a>
      </div>
    </div>
  )
}
