import Image from 'next/image'
import { requirePageAccess } from '@/lib/require-page-access'
import { prisma } from '@/lib/prisma'
import { toDataURL } from 'qrcode'

export const metadata = {
  title: 'طباعة رمز QR للطاولة',
}

export default async function TablePrintPage({
  params,
}: {
  params: Promise<{ tableId: string }>
}) {
  const resolvedParams = await params
  const tableId = resolvedParams.tableId
  await requirePageAccess('/tables')

  let tableIdNumber: bigint | null = null
  try {
    tableIdNumber = BigInt(tableId)
  } catch {
    // Invalid ID format
  }

  if (!tableIdNumber) {
    return (
      <div className="min-h-screen bg-background p-6 text-foreground flex flex-col items-center justify-center">
        <h1 className="text-xl font-bold">معرف الطاولة غير صالح</h1>
        <a
          href="/tables"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#241B17] text-[#FFFCF8] font-semibold hover:bg-[#B98757]"
        >
          العودة للصفحة الرئيسية
        </a>
      </div>
    )
  }

  const table = await prisma.cafeTable.findUnique({
    where: { id: tableIdNumber, isActive: true, deletedAt: null },
    include: {
      branch: { select: { name: true } },
    },
  })

  if (!table) {
    return (
      <div className="min-h-screen bg-background p-6 text-foreground flex flex-col items-center justify-center">
        <h1 className="text-xl font-bold">الطاولة غير موجودة</h1>
        <a
          href="/tables"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#241B17] text-[#FFFCF8] font-semibold hover:bg-[#B98757]"
        >
          العودة للصفحة الرئيسية
        </a>
      </div>
    )
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://sokooncafe.com' : 'http://localhost:3000')

  const url = `${baseUrl}/menu/${table.publicToken}`
  const qrDataUrl = await toDataURL(url, {
    width: 500,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a1a1a', light: '#ffffff' },
  })

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8 text-foreground" dir="rtl" lang="ar">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden; }
              .print-area, .print-area * { visibility: visible; }
              .print-area { position: absolute; inset: 0; padding: 0; }
              .no-print { display: none !important; }
            }
          `,
        }}
      />

      {/* Header — hidden when printing */}
      <div className="no-print mx-auto mb-8 max-w-2xl">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="شعار سكون"
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold">رمز QR للطاولة {table.number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              امسح الرمز لعرض منيو الطاولة مباشرة.
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#241B17] text-[#FFFCF8] font-semibold text-sm hover:bg-[#B98757] hover:text-[#241B17] transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            طباعة
          </button>
          <a
            href="/tables"
            className="no-print inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            العودة للطاولات
          </a>
        </div>
      </div>

      {/* Print area */}
      <div className="print-area mx-auto max-w-[300px]">
        <div className="flex flex-col items-center rounded-xl border bg-card p-6 text-center shadow-sm">
          <Image
            src="/logo.png"
            alt="شعار سكون"
            width={48}
            height={48}
            className="mb-3 h-12 w-12 object-contain"
          />
          <div className="mb-2 text-lg font-bold">طاولة {table.number}</div>
          {table.branch?.name && (
            <div className="mb-3 text-xs text-muted-foreground">{table.branch.name}</div>
          )}
          <img
            src={qrDataUrl}
            alt={`رمز QR للطاولة ${table.number}`}
            width={200}
            height={200}
            className="h-48 w-48 rounded border bg-white p-2"
          />
          <div className="mt-2 break-all text-[10px] leading-tight text-muted-foreground font-mono">
            {url}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            امسح الرمز لعرض المنيو
          </div>
        </div>
      </div>
    </div>
  )
}