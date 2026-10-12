import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PublicBackdrop } from '@/components/public/public-backdrop'

export const dynamic = 'force-dynamic'

/**
 * Step 2 — manual table picker for guests without a QR scan.
 * Links carry the table's `publicToken` (never the numeric id).
 * Route is `/select-table` (NOT `/tables`) to avoid colliding with the staff
 * tables page under the (app) group — route groups are URL-invisible.
 * Shares the brand backdrop with the rest of the guest flow; the grid is
 * vertically centred and only scrolls if the table list outgrows the screen.
 */
export default async function SelectTablePage() {
  const tables = await prisma.cafeTable.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
    select: { number: true, name: true, capacity: true, publicToken: true },
  })

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center py-10">
      <PublicBackdrop />
      <div className="relative z-10 flex w-full max-w-md flex-col gap-4 px-4 text-white">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-bold drop-shadow-lg">اختار طاولتك</h1>
          <p className="text-sm text-white/70">
            {tables.length === 0
              ? 'لا توجد طاولات متاحة حالياً — اسأل فريق الكافيه.'
              : 'دوس على رقم طاولتك عشان تفتح المنيو.'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {tables.map((t) => (
            <Link key={t.publicToken} href={`/menu/${t.publicToken}`}>
              <Card className="border-white/30 bg-white/10 transition-colors hover:border-orange-400/70 hover:bg-white/20">
                <CardContent className="flex flex-col items-center gap-1 p-4 text-center text-white">
                  <span className="text-2xl font-bold">{t.number}</span>
                  {t.name ? <span className="text-xs text-white/70">{t.name}</span> : null}
                  <span className="text-[11px] text-white/70">{t.capacity} مقاعد</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <Link href="/">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-white/80 hover:bg-white/10 hover:text-white"
          >
            رجوع
          </Button>
        </Link>
      </div>
    </div>
  )
}
