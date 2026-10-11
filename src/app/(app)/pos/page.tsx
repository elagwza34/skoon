import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { getPosCatalog, PosError } from '@/lib/staff-pos'
import { PosCheckout } from '@/components/pos/pos-checkout'

export const dynamic = 'force-dynamic'

/** POS screen — real branch catalog + tables, server-side pricing on submit. */
export default async function PosPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')

  try {
    const catalog = await getPosCatalog(session)
    return <PosCheckout catalog={catalog} />
  } catch (e) {
    if (e instanceof PosError) redirect('/dashboard')
    throw e
  }
}