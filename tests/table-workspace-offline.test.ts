/** Executable service doubles, not PostgreSQL isolation/stock acceptance. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Prisma } from '@prisma/client'
import { isActiveTableOrder, canManageTableOrder, mayAppendToOrder } from '../src/lib/table-order-policy'
import { appendOrderItems, sendOrderToKitchen } from '../src/lib/staff-orders'
import { createPosOrder } from '../src/lib/staff-pos-write'
import { adjustOrderItem, planOrderItemAdjustment } from '../src/lib/staff-order-item-adjustment'
import { voidOpenOrderItem } from '../src/lib/staff-order-item-void'
import type { StaffSession } from '../src/lib/session'
const cashierId = '11111111-1111-4111-8111-111111111111', waiterId = '22222222-2222-4222-8222-222222222222'
const actor = (role: StaffSession['role'] = 'cashier', id = cashierId, branchId = '1'): StaffSession => ({ role, id, branchId, permissions: ['orders.update', 'orders.cancel'], name: role, email: null })
const d = (n: unknown) => new Prisma.Decimal(String(n))

function fixture() {
  const item = (id: bigint) => ({ id, orderId: 10n, productId: 1n, productName: 'Coffee', quantity: 1, unitPrice: d(10), lineTotal: '10.00', discountType: null, discountValue: d(0), eligibleForInvoiceDiscount: true, servedQuantity: 0, preparedQuantity: 0, preparationStartedAt: null, updatedAt: new Date('2026-11-04T10:00:00Z'), isVoided: false, product: { recipes: [], inventoryItemId: null }, productVariant: null, options: [] })
  const s: any = { order: { id: 10n, branchId: 1n, cafeTableId: 1n, orderNumber: 'T10', orderType: 'dine_in', status: 'new', paymentStatus: 'unpaid', responsibleWaiterId: waiterId, sentToKitchenAt: new Date(), discountType: null, discountValue: d(0), taxRate: d(0), total: d(20), source: 'waiter', qrApprovedAt: null }, items: [item(1n), item(2n)], operations: [], audits: [], notifications: [], histories: [], locks: [], paid: 0, hasShift: true, exists: true, failAudit: false }
  const product = { id: 1n, name: 'Coffee', price: d(10), variants: [], optionAssignments: [] }
  const match = (row: any, where: any) => Object.entries(where).every(([k, v]) => v === undefined || (typeof v === 'object' && v !== null && 'in' in v ? (v as any).in.includes(row[k]) : row[k] === v))
  const tx: any = {
    $executeRaw: async () => 1, $executeRawUnsafe: async () => 1,
    $queryRaw: async (parts: TemplateStringsArray, ...values: any[]) => {
      const sql = parts.join(''); s.locks.push(sql)
      if (sql.includes('FROM shifts')) return s.hasShift ? [{ id: 5n, branchId: 1n, cashierId: cashierId, status: 'open' }] : []
      if (sql.includes('FROM cafe_tables')) return values[0] === 1n && values[1] === 1n ? [{ id: 1n }] : []
      if (sql.includes('FROM order_items')) return [{ id: values[0] }]
      if (sql.includes('FROM orders')) return [{ ...s.order, payment_status: s.order.paymentStatus, responsible_waiter_id: s.order.responsibleWaiterId, discount_type: null, discount_value: d(0), tax_rate: d(0), sent_to_kitchen_at: s.order.sentToKitchenAt }]
      throw Error('Unexpected SQL')
    },
    shift: { findFirst: async ({ where }: any) => s.hasShift ? { id: 5n, branchId: 1n, cashierId: where.cashierId, status: 'open' } : null },
    cafeTable: { findFirst: async ({ where }: any) => where.branchId === 1n ? { id: 1n } : null },
    product: { findMany: async () => [product] }, productVariant: { findMany: async () => [] },
    order: {
      findUnique: async () => ({ ...s.order }),
      findFirst: async () => s.exists && isActiveTableOrder(s.order) ? { id: s.order.id } : null,
      update: async ({ data }: any) => { Object.assign(s.order, data); return s.order },
      create: async ({ data }: any) => { s.exists = true; s.order = { ...s.order, ...data, id: 10n }; s.items = data.items.create.map((l: any, i: number) => ({ ...item(BigInt(i + 1)), ...l })); return s.order },
    },
    orderItem: {
      findMany: async ({ where }: any) => s.items.filter((i: any) => match(i, where)),
      findFirst: async ({ where }: any) => s.items.find((i: any) => match(i, where)) ?? null,
      findFirstOrThrow: async ({ where }: any) => { const i = s.items.find((i: any) => match(i, where)); if (!i) throw Error('Missing item'); return { ...i } },
      count: async ({ where }: any) => s.items.filter((i: any) => match(i, where)).length,
      create: async ({ data }: any) => { const row = { ...item(BigInt(s.items.length + 1)), ...data }; s.items.push(row); return row },
      update: async ({ where, data }: any) => { const row = s.items.find((i: any) => i.id === where.id); Object.assign(row, data); return row },
    },
    inventoryReservation: { findMany: async () => [], count: async () => 0, createMany: async () => ({ count: 0 }) },
    payment: { count: async () => s.paid > 0 ? 1 : 0, aggregate: async () => ({ _sum: { amount: d(s.paid) } }) },
    financialOperation: { findUnique: async ({ where }: any) => s.operations.find((o: any) => match(o, where.branchId_actorId_operationType_idempotencyKey)) ?? null, create: async ({ data }: any) => { s.operations.push(data); return data } },
    auditLog: { create: async ({ data }: any) => { if (s.failAudit) throw Error('audit failed'); s.audits.push(data); return data } },
    user: { findMany: async () => [{ id: 'recipient' }] }, notification: { createMany: async ({ data }: any) => { s.notifications.push(...data); return { count: data.length } } },
    orderStatusHistory: { create: async ({ data }: any) => { s.histories.push(data); return data } },
  }
  let queue = Promise.resolve()
  const client = { ...tx, $transaction: (fn: (tx: any) => Promise<any>) => {
    const result = queue.then(async () => {
      const snapshot = { order: { ...s.order }, items: s.items.map((i: any) => ({ ...i })), operations: [...s.operations], audits: [...s.audits], notifications: [...s.notifications], histories: [...s.histories] }
      try { return await fn(tx) } catch (e) { Object.assign(s, snapshot); throw e }
    }); queue = result.then(() => undefined, () => undefined); return result
  } }
  ;(globalThis as any).prisma = client
  return { s, client, product }
}
const addition = (key = 'append-key-01') => ({ items: [{ productId: '1', qty: 1 }], idempotencyKey: key })
for (const [status, paymentStatus, orderType, active] of [['served', 'unpaid', 'dine_in', true], ['ready', 'partial', 'dine_in', true], ['pending', 'unpaid', 'dine_in', false], ['new', 'paid', 'dine_in', false], ['cancelled', 'unpaid', 'dine_in', false], ['new', 'unpaid', 'takeaway', false]] as const) test('occupancy: ' + [status, paymentStatus, orderType].join('/'), () => assert.equal(isActiveTableOrder({ status, paymentStatus, orderType }), active))
test('workspace permission is branch-independent policy: cashier any owner, waiter own only', () => { assert.equal(canManageTableOrder('cashier', cashierId, waiterId), true); assert.equal(canManageTableOrder('waiter', waiterId, waiterId), true); assert.equal(canManageTableOrder('waiter', cashierId, waiterId), false); assert.equal(canManageTableOrder('kitchen', cashierId, waiterId), false) })
test('available table creation uses one existing POS writer and table lock', async () => { const f = fixture(); f.s.exists = false; const r = await createPosOrder(actor(), { orderType: 'dine_in', tableId: '1', items: [{ productId: '1', qty: 1 }] }, 'create-key-01'); assert.equal(r.id, '10'); assert.equal(f.s.order.cafeTableId, 1n); assert.ok(f.s.locks.some((s: string) => s.includes('FROM cafe_tables'))); assert.equal(f.s.items.length, 1) })
test('occupied table creation rejects instead of creating another active order', async () => { const f = fixture(); await assert.rejects(createPosOrder(actor(), { orderType: 'dine_in', tableId: '1', items: [{ productId: '1', qty: 1 }] }, 'create-key-01')); assert.equal(f.s.items.length, 2) })
test('cashier appends to waiter order, preserving identity and old kitchen progress', async () => { const f = fixture(); f.s.order.status = 'served'; f.s.items[0].servedQuantity = 1; f.s.items[0].preparedQuantity = 1; const before = { ...f.s.items[0] }; const r = await appendOrderItems(actor(), '10', addition()); assert.equal(r.orderId, '10'); assert.equal(f.s.order.cafeTableId, 1n); assert.equal(f.s.items.length, 3); assert.equal(f.s.items[0].servedQuantity, before.servedQuantity); assert.equal(f.s.items[0].preparedQuantity, before.preparedQuantity); assert.equal(f.s.order.status, 'preparing'); assert.equal(f.s.notifications.length, 1); assert.ok(f.s.notifications[0].body.includes('3')) })
test('waiter ownership restriction rejects another waiter before append', async () => { const f = fixture(); await assert.rejects(appendOrderItems(actor('waiter'), '10', addition())); assert.equal(f.s.items.length, 2) })
test('unsent draft additions do not reserve or notify the kitchen', async () => { const f = fixture(); f.s.order.sentToKitchenAt = null; await appendOrderItems(actor(), '10', addition()); assert.equal(f.s.notifications.length, 0); assert.equal(f.s.items.length, 3) })
test('two additions and duplicate retry preserve every line (transaction double only)', async () => { const f = fixture(); await Promise.all([appendOrderItems(actor(), '10', addition('append-key-01')), appendOrderItems(actor(), '10', addition('append-key-02'))]); assert.equal(f.s.items.length, 4); await appendOrderItems(actor(), '10', addition('append-key-01')); assert.equal(f.s.items.length, 4); assert.equal(f.s.notifications.length, 2) })
test('required modifiers cannot be omitted or altered under an old retry key', async () => { const f = fixture(); f.product.optionAssignments = [{ productOption: { id: 3n, name: 'Size', type: 'single', isRequired: true, minSelections: 1, maxSelections: 1, isActive: true, values: [{ id: 4n, value: 'Large', priceAdjustment: d(2), isActive: true }] } }] as any; await assert.rejects(appendOrderItems(actor(), '10', addition())); const input = { items: [{ productId: '1', qty: 1, modifierSelections: [{ groupId: '3', valueIds: ['4'] }] }], idempotencyKey: 'configured-01' }; await appendOrderItems(actor(), '10', input); await assert.rejects(appendOrderItems(actor(), '10', { ...input, items: [{ ...input.items[0], modifierSelections: [] }] })); assert.equal(f.s.items.length, 3) })
test('partial payment remains collected while additions change total only', async () => { const f = fixture(); f.s.paid = 15; f.s.order.paymentStatus = 'partial'; await appendOrderItems(actor(), '10', addition()); assert.equal(f.s.paid, 15); assert.equal(f.s.order.total, '30.00'); assert.equal(f.s.order.paymentStatus, 'partial') })
test('cross-branch and missing shift reject mutations', async () => { const f = fixture(); await assert.rejects(appendOrderItems(actor('cashier', cashierId, '2'), '10', addition())); f.s.hasShift = false; await assert.rejects(appendOrderItems(actor(), '10', addition())); assert.equal(f.s.items.length, 2) })
test('cashier can dispatch an unsent dine-in order without replaying a previous dispatch', async () => { const f = fixture(); f.s.order.sentToKitchenAt = null; await sendOrderToKitchen(actor(), '10'); await sendOrderToKitchen(actor(), '10'); assert.equal(f.s.notifications.length, 1) })
for (const prepared of [0, 1]) test('void preserves item evidence with prepared quantity ' + prepared, async () => { const f = fixture(); f.s.items[0].preparedQuantity = prepared; f.s.items[0].preparationStartedAt = prepared ? new Date() : null; await voidOpenOrderItem(actor(), '10', '1', { reason: 'Customer cancellation', idempotencyKey: 'void-key-01', expectedUpdatedAt: f.s.items[0].updatedAt.toISOString() }); assert.equal(f.s.items[0].isVoided, true); assert.equal(f.s.items.length, 2); await voidOpenOrderItem(actor(), '10', '1', { reason: 'Customer cancellation', idempotencyKey: 'void-key-01' }); assert.equal(f.s.audits.length, 1) })
test('served items and stale versions reject destructive edits', async () => { const f = fixture(); f.s.items[0].servedQuantity = 1; await assert.rejects(voidOpenOrderItem(actor(), '10', '1', { reason: 'Cannot erase served', idempotencyKey: 'void-key-01' })); await assert.rejects(adjustOrderItem(actor(), '10', '2', { action: 'quantity', targetQuantity: 2, reason: 'Stale version', expectedUpdatedAt: '2020-01-01T00:00:00Z', idempotencyKey: 'adjust-key-01' })); assert.equal(f.s.items.length, 2) })
test('partial-payment reduction below collected rolls back item and invoice', async () => { const f = fixture(); f.s.order.paymentStatus = 'partial'; f.s.paid = 15; await assert.rejects(voidOpenOrderItem(actor(), '10', '1', { reason: 'Would undercut payment', idempotencyKey: 'void-key-01' })); assert.equal(f.s.items[0].isVoided, false); assert.equal(f.s.items.length, 2) })
test('preparing quantity plan separates additions and quantifies partial waste', () => { assert.equal(planOrderItemAdjustment({ action: 'quantity', currentQuantity: 5, preparedQuantity: 3, servedQuantity: 0, targetQuantity: 7 }).addedUnits, 2); assert.equal(planOrderItemAdjustment({ action: 'quantity', currentQuantity: 5, preparedQuantity: 3, servedQuantity: 0, targetQuantity: 2 }).wasteQuantity, 1); assert.equal(mayAppendToOrder('served', 'partial'), true); assert.equal(mayAppendToOrder('pending', 'unpaid'), false) })
test('audit failure rolls back additions and notification in transaction double', async () => { const f = fixture(); f.s.failAudit = true; await assert.rejects(appendOrderItems(actor(), '10', addition())); assert.equal(f.s.items.length, 2); assert.equal(f.s.notifications.length, 0) })
