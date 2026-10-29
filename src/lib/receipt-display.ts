export function receiptOrderTypeLabel(value: string): string {
  return value.toLowerCase() === 'takeaway' ? 'تيك أواي' : 'داخل الكافيه'
}

export function captureReceiptPrintTimestamp(now: () => Date = () => new Date()): Date {
  return now()
}

export function formatReceiptPrintTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}
