/** Client-safe contract shared by the settlement UI and regression tests. */
export function buildPaymentRequestPayload(
  method: string,
  received: string,
  electronicPaymentConfirmed: boolean,
  externalTransactionReference?: string,
  confirmationNote?: string,
) {
  const base: Record<string, unknown> = { action: 'pay' as const, method }
  if (method === 'cash') {
    return { ...base, received }
  }
  return {
    ...base,
    electronicPaymentConfirmed,
    externalTransactionReference: externalTransactionReference ?? '',
    confirmationNote: confirmationNote ?? '',
  }
}

/** Explicit allowlist between HTTP JSON and the server-side payment writer. */
export function paymentServiceInputFromRequest(body: Record<string, unknown>, idempotencyKey?: string | null) {
  return {
    method: body.method,
    received: body.received,
    electronicPaymentConfirmed: body.electronicPaymentConfirmed,
    externalTransactionReference: body.externalTransactionReference,
    confirmationNote: body.confirmationNote,
    idempotencyKey,
  }
}
