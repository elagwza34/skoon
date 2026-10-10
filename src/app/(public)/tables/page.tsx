import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * Step 2 — manual table picker for guests without a QR scan.
 * Links carry the table's `publicToken` (never the numeric id).
 */
export default async function TablesPage() {
  const tables = await prisma.cafeTable.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
    select: { number: true, name: true, capacity: true, publicToken: true },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">اختار طاولتك</h1>
        <p className="text-sm text-muted-foreground">
          {tables.length === 0
            ? 'لا توجد طاولات متاحة حالياً — اسأل فريق الكافيه.'
            : 'دوس على رقم طاولتك عشان تفتح المنيو.'}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {tables.map((t) => (
          <Link key={t.publicToken} href={`/menu/${t.publicToken}`}>
            <Card className={cn('transition-colors hover:border-primary/60')}>
              <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
                <span className="text-2xl font-bold">{t.number}</span>
                {t.name ? <span className="text-xs text-muted-foreground">{t.name}</span> : null}
                <span className="text-[11px] text-muted-foreground">{t.capacity} مقاعد</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Link href="/">
        <Button variant="ghost" size="sm" className="w-full">
          رجوع
        </Button>
      </Link>
    </div>
  )
}
