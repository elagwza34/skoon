import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PublicBackdrop } from '@/components/public/public-backdrop'

export const dynamic = 'force-dynamic'

/**
 * Step 2 â€” manual table picker for guests without a QR scan.
 * Links carry the table's `publicToken` (never the numeric id).
 * Route is `/select-table` (NOT `/tables`) to avoid colliding with the staff
 * tables page under the (app) group â€” route groups are URL-invisible.
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
          <h1 className="text-xl font-bold drop-shadow-lg">Ø§Ø®ØªØ§Ø± Ø·Ø§ÙˆÙ„ØªÙƒ</h1>
          <p className="text-sm text-white/70">
            {tables.length === 0
              ? 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ø§ÙˆÙ„Ø§Øª Ù…ØªØ§Ø­Ø© Ø­Ø§Ù„ÙŠØ§Ù‹ â€” Ø§Ø³Ø£Ù„ ÙØ±ÙŠÙ‚ Ø§Ù„ÙƒØ§ÙÙŠÙ‡.'
              : 'Ø¯ÙˆØ³ Ø¹Ù„Ù‰ Ø±Ù‚Ù… Ø·Ø§ÙˆÙ„ØªÙƒ Ø¹Ø´Ø§Ù† ØªÙØªØ­ Ø§Ù„Ù…Ù†ÙŠÙˆ.'}
          </p>
        </div>
        {/* Equal-height cards: every card renders the same 3 rows (number, name,
            capacity). Tables without a name get a fixed-height placeholder so
            short cards don't shrink and the grid stays uniform. */}
        <div className="grid grid-cols-3 gap-3">
          {tables.map((t) => (
            <Link key={t.publicToken} href={`/menu/${t.publicToken}`} className="h-full">
              <Card className="flex h-full flex-col justify-center border-white/30 bg-white/10 transition-colors hover:border-orange-400/70 hover:bg-white/20">
                <CardContent className="flex min-h-[104px] flex-col items-center justify-center gap-1 p-4 text-center text-white">
                  <span className="text-2xl font-bold leading-none">{t.number}</span>
                  <span className="h-4 text-xs leading-4 text-white/70" aria-hidden={!t.name}>
                    {t.name ?? 'Â '}
                  </span>
                  <span className="text-[11px] text-white/70">{t.capacity} Ù…Ù‚Ø§Ø¹Ø¯</span>
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
            Ø±Ø¬ÙˆØ¹
          </Button>
        </Link>
      </div>
    </div>
  )
}


