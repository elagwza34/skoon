import { toDataURL } from 'qrcode'
import { tableMenuUrl } from '@/lib/qr'

/**
 * Server-side QR rendering for table cards.
 *
 * The QR encodes the customer menu URL (`/menu/<token>`) — NOT the numeric table
 * id — so scanning opens that table's menu and the order is attributed to the
 * correct table server-side. Returns a base64 PNG data URL suitable for an
 * `<img src>`. Rendering happens on the server; no QR logic runs in the browser.
 */

export interface QrRenderOptions {
  /** Pixel size of the square output (higher = crisper print). Default 512. */
  width?: number
  /** Quiet-zone in modules. 1 stays compact yet scannable. Default 1. */
  margin?: number
  /** Error-correction level. 'M' balances size + resilience to smudges. */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
}

/** Render a table's menu QR as a PNG data URL. */
export async function renderTableQrDataUrl(
  token: string,
  options: QrRenderOptions = {},
): Promise<string> {
  const url = tableMenuUrl(token)
  return toDataURL(url, {
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'M',
    margin: options.margin ?? 1,
    width: options.width ?? 512,
    // Pure black on white — maximum contrast for reliable phone-camera scans.
    color: { dark: '#000000ff', light: '#ffffffff' },
  })
}
