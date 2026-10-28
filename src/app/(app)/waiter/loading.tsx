import { Card, CardContent } from '@/components/ui/card'

/** Server-route loading state for both the waiter station and Owner monitor. */
export default function WaiterLoading() {
  return <main dir="rtl" className="min-h-dvh bg-background p-3 sm:p-5" aria-busy="true" aria-label="Ø¬Ø§Ø±Ù ØªØ­Ù…ÙŠÙ„ Ù„ÙˆØ­Ø© Ø§Ù„ÙˆÙŠØªØ± ÙˆØ§Ù„Ø®Ø¯Ù…Ø©">
    <div className="mx-auto grid max-w-[1600px] gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => <Card key={index}><CardContent className="space-y-3 p-4"><div className="h-5 w-2/3 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /><div className="h-4 w-4/5 animate-pulse rounded bg-muted" /></CardContent></Card>)}
    </div>
  </main>
}


