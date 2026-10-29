export type WaiterPosOrderReference = {
  id: string
  orderNumber: string
  total: string
}

export type WaiterPosConfirmationResult = {
  order: WaiterPosOrderReference
  dispatched: boolean
  dispatchError?: string
}

/**
 * Persists one waiter order, then dispatches that exact saved order.
 * A dispatch failure is recoverable and must never repeat order creation.
 */
export async function confirmWaiterPosOrder(
  createOrder: () => Promise<WaiterPosOrderReference>,
  dispatchOrder: (orderId: string) => Promise<void>,
): Promise<WaiterPosConfirmationResult> {
  const order = await createOrder()
  try {
    await dispatchOrder(order.id)
    return { order, dispatched: true }
  } catch (cause) {
    return {
      order,
      dispatched: false,
      dispatchError: cause instanceof Error ? cause.message : 'تعذر إرسال الطلب للمطبخ',
    }
  }
}
