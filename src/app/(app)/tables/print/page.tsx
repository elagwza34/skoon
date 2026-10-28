import Image from 'next/image'
import { requirePageAccess } from '@/lib/require-page-access'
import { prisma } from '@/lib/prisma'
import { toDataURL } from 'qrcode'
import { PrintButton } from '@/components/tables/print-button'

export const metadata = {
  title: 'Ø·Ø¨Ø§Ø¹Ø© Ø±Ù…ÙˆØ² QR â€” Skoon',
}

export default async function TablePrintPage() {
  await requirePageAccess('/tables')

  const tables = await prisma.cafeTable.findMany({
    where: { isActive: true },
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
        width: 400,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#1a1a1a', light: '#ffffff' },
      })
      return { ...table, url, qrDataUrl }
    })
  )

  return (
    <div className="min-h-screen bg-background p-6 text-foreground" dir="rtl">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden; }
              .print-area, .print-area * { visibility: visible; }
              .print-area { position: absolute; inset: 0; padding: 0; }
              .no-print { display: none !important; }
              .qr-card { break-inside: avoid; page-break-inside: avoid; }
            }
          `,
        }}
      />

      {/* Header â€” hidden when printing */}
      <div className="no-print mx-auto mb-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Ø´Ø¹Ø§Ø± Ø³ÙƒÙˆÙ†"
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold">Ø·Ø¨Ø§Ø¹Ø© Ø±Ù…ÙˆØ² QR Ù„Ù„Ø·Ø§ÙˆÙ„Ø§Øª</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ÙƒÙ„ Ø±Ù…Ø² QR ÙŠÙØªØ­ Ù…Ù†ÙŠÙˆ Ø§Ù„Ø·Ø§ÙˆÙ„Ø© Ù…Ø¨Ø§Ø´Ø±Ø©. Ø§Ø¶ØºØ· <kbd className="rounded border px-1.5 py-0.5 text-xs">Ctrl</kbd> + <kbd className="rounded border px-1.5 py-0.5 text-xs">P</kbd> Ø£Ùˆ Ø§Ø³ØªØ®Ø¯Ù… Ø²Ø± Ø§Ù„Ø·Ø¨Ø§Ø¹Ø© Ø¨Ø§Ù„Ø£Ø³ÙÙ„.
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª: <strong>{tablesWithQr.length}</strong>
        </p>
        <PrintButton />
      </div>

      {/* QR grid */}
      {tablesWithQr.length === 0 ? (
        <div className="no-print mx-auto max-w-md rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ø§ÙˆÙ„Ø§Øª Ù†Ø´Ø·Ø©. Ø£Ø¶Ù Ø·Ø§ÙˆÙ„Ø§Øª Ù…Ù† ØµÙØ­Ø© Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª Ø£ÙˆÙ„Ø§Ù‹.</p>
        </div>
      ) : (
        <div className="print-area mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {tablesWithQr.map((table) => (
            <div
              key={table.id}
              className="qr-card flex flex-col items-center rounded-xl border bg-card p-4 text-center shadow-sm"
            >
              <Image
                src="/logo.png"
                alt="Ø´Ø¹Ø§Ø± Ø³ÙƒÙˆÙ†"
                width={64}
                height={64}
                className="mb-2 h-16 w-16 object-contain"
              />
              <div className="mb-2 text-lg font-bold">Ø·Ø§ÙˆÙ„Ø© {table.number}</div>
              {table.branch?.name && (
                <div className="mb-2 text-xs text-muted-foreground">{table.branch.name}</div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={table.qrDataUrl}
                alt={`Ø±Ù…Ø² QR Ù„Ù„Ø·Ø§ÙˆÙ„Ø© ${table.number}`}
                width={160}
                height={160}
                className="h-40 w-40 rounded border bg-white p-1"
              />
              <div className="mt-2 break-all text-[10px] leading-tight text-muted-foreground">
                {table.url}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Ø§Ù…Ø³Ø­ Ø§Ù„Ø±Ù…Ø² Ù„Ø¹Ø±Ø¶ Ø§Ù„Ù…Ù†ÙŠÙˆ
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


