import { notFound } from 'next/navigation'
import { getTableByToken, getPublicMenu } from '@/lib/public-menu'
import { MenuOrderView } from '@/components/menu/menu-order-view'

export const dynamic = 'force-dynamic'

/**
 * QR menu — served at /menu/[token]. Resolves the capability token to a
 * table, then renders the live branch menu with a cart + order submit.
 */
export default async function MenuPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const table = await getTableByToken(token)
  if (!table) notFound()
  const menu = await getPublicMenu(table)
  return <MenuOrderView menu={menu} />
}
