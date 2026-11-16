import assert from 'node:assert/strict'
import { test } from 'node:test'

test('waiter order creation stores optional customer name/phone and permits either field to be absent', async () => {
  process.env.DATABASE_URL = 'postgresql://offline:offline@127.0.0.1:1/forbidden'
  process.env.DIRECT_URL = process.env.DATABASE_URL
  const session = { id: '11111111-1111-4111-8111-111111111111', role: 'waiter' as const, branchId: '1', permissions: [], name: 'Waiter', email: null }
  const shift = { id: 1n, branchId: 1n, cashierId: session.id, status: 'open' }
  let written: any
  const stop = new Error('Captured write boundary; no database writes')
  const tx: any = {
    $executeRawUnsafe: async () => 1,
    $executeRaw: async () => 1,
    $queryRaw: async (sql: TemplateStringsArray) => {
      if (sql.join('').includes('FROM shifts')) return [shift]
      if (sql.join('').includes('FROM cafe_tables')) return [{ id: 1n }]
      throw new Error('Unexpected read in offline regression')
    },
    order: { findFirst: async () => null, create: async ({ data }: any) => { written = data; throw stop } },
  }
  ;(globalThis as any).prisma = {
    shift: { findFirst: async () => shift },
    cafeTable: { findFirst: async () => ({ id: 1n }) },
    product: { findMany: async () => [{ id: 11n, name: 'Coffee', price: '100.00', taxRate: '0', variants: [], optionAssignments: [] }] },
    $transaction: async (body: any) => body(tx),
  }
  const { createPosOrder } = await import('../src/lib/staff-pos-write')
  for (const customer of [{}, { customerName: '  Customer  ' }, { customerPhone: '  01012345678  ' }, { customerName: 'Customer', customerPhone: '01012345678' }]) {
    await assert.rejects(createPosOrder(session, { orderType: 'dine_in', tableId: '1', items: [{ productId: '11', qty: 1 }], ...customer }), error => error === stop)
    assert.equal(written.customerName, customer.customerName?.trim() ?? null)
    assert.equal(written.customerPhone, customer.customerPhone?.trim() ?? null)
    assert.equal(written.responsibleWaiterId, session.id)
    assert.equal(written.total, '100.00')
  }
})
