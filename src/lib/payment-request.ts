/** Client-safe contract shared by the settlement UI and regression tests. */
export function buildPaymentRequestPayload(
  method: string,
  received: string,
  electronicPaymentConfirmed: boolean,
) {
  return method === 'cash'
    ? { action: 'pay' as const, method, received }
    : { action: 'pay' as const, method, electronicPaymentConfirmed }
}

/** Explicit allowlist between HTTP JSON and the server-side payment writer. */
export function paymentServiceInputFromRequest(body: Record<string, unknown>, idempotencyKey?: string | null) {
  return {
    method: body.method,
    received: body.received,
    electronicPaymentConfirmed: body.electronicPaymentConfirmed,
    idempotencyKey,
  }
}
