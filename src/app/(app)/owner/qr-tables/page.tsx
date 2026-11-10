import Image from 'next/image'
import { requirePageAccess } from '@/lib/require-page-access'
import { prisma } from '@/lib/prisma'
import { toDataURL } from 'qrcode'

export const metadata = {
  title: 'رموز QR للطاولات — لوحة المالك',
}

export default async function OwnerQrTablesPage() {
  const session = await requirePageAccess('/owner')

  const tables = await prisma.cafeTable.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { number: 'asc' },
    include: {
      branch: { select: { name: true } },
    },
  })

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://sokooncafe.com' : 'http://localhost:3000')

  const tablesWithQr = await Promise.all(
    tables.map(async (table) => {
      const url = `${baseUrl}/menu/${table.publicToken}`
      const qrDataUrl = await toDataURL(url, {
        width: 500,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1a1a1a', light: '#ffffff' },
      })
      return { ...table, url, qrDataUrl }
    })
  )

  return (
    <div className="min-h-dvh bg-background p-4 sm:p-6 text-foreground" dir="rtl" lang="ar">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden; }
              .no-print { display: none !important; }
              .qr-card { break-inside: avoid; page-break-inside: avoid; }
            }
          `,
        }}
      />

      {/* Header — hidden when printing */}
      <div className="no-print mx-auto mb-8 max-w-5xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">رموز QR للطاولات — لوحة المالك</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              كل رمز QR يفتح منيو الطاولة مباشرة للعملاء. يمكن طباعة كل رمز بشكل فردي أو طباعة جميع الرموز.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.print()}
              className="no-print inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#241B17] text-[#FFFCF8] font-semibold text-sm hover:bg-[#B98757] hover:text-[#241B17] transition-all duration-300 shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              طباعة الكل
            </button>
            <a
              href="/owner"
              className="no-print inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              العودة للوحة المالك
            </a>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          إجمالي الطاولات النشطة: <strong>{tablesWithQr.length}</strong>
        </p>
      </div>

      {/* QR Grid */}
      {tablesWithQr.length === 0 ? (
        <div className="no-print mx-auto max-w-md rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>لا توجد طاولات نشطة. أضف طاولات من صفحة الطاولات أولاً.</p>
        </div>
      ) : (
        <div className="grid max-w-5xl mx-auto grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {tablesWithQr.map((table) => (
            <div
              key={table.id}
              className="qr-card flex flex-col items-center rounded-xl border bg-card p-4 text-center shadow-sm"
            >
              <Image
                src="/logo.png"
                alt="شعار سكون"
                width={64}
                height={64}
                className="mb-2 h-16 w-16 object-contain"
              />
              <div className="mb-2 text-lg font-bold">طاولة {table.number}</div>
              {table.branch?.name && (
                <div className="mb-2 text-xs text-muted-foreground">{table.branch.name}</div>
              )}
              <img
                src={table.qrDataUrl}
                alt={`رمز QR للطاولة ${table.number}`}
                width={160}
                height={160}
                className="h-40 w-40 rounded border bg-white p-1"
              />
              <div className="mt-2 break-all text-[10px] leading-tight text-muted-foreground font-mono">
                {table.url}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                امسح الرمز لعرض المنيو
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}