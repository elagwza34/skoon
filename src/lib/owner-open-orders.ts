import type { InvoiceRow } from '@/lib/staff-invoices'

/** Settlement, not kitchen preparation status, defines the Owner's open queue. */
export function selectOwnerOpenOrders(invoices: readonly InvoiceRow[], query = ''): InvoiceRow[] {
  const search = query.trim().toLowerCase()
  return invoices.filter(invoice => !invoice.isArchived && invoice.status !== 'cancelled' && Number(invoice.remaining) > 0 && (
    !search || [invoice.number, invoice.table, invoice.branch, invoice.creator ?? ''].some(value => value.toLowerCase().includes(search))
  ))
}
