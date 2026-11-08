/** Matches the established active dine-in table invariant, including served/unpaid. */
export const activeTableOrderWhere = { orderType: 'dine_in', status: { notIn: ['cancelled', 'pending'] }, paymentStatus: { not: 'paid' } }
export function isActiveTableOrder(order: { orderType: string; status: string; paymentStatus: string }) {
  return order.orderType === 'dine_in' && !['cancelled', 'pending'].includes(order.status) && order.paymentStatus !== 'paid'
}
export function canManageTableOrder(role: string, actorId: string, responsibleWaiterId: string | null) {
  return role === 'cashier' || (role === 'waiter' && actorId === responsibleWaiterId)
}
export function mayAppendToOrder(status: string, paymentStatus: string) {
  return ['new', 'preparing', 'ready', 'served'].includes(status) && paymentStatus !== 'paid'
}
