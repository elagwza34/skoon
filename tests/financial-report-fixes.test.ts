import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateVat, parseVatDate } from '../src/lib/vat-report'
import { calculateSnapshotTax } from '../src/lib/invoice-tax'

test('financial date filters cover the Cairo calendar day and reject impossible dates', () => {
  assert.equal(parseVatDate('2026-11-16')?.toISOString(), '2026-11-15T22:00:00.000Z')
  assert.equal(parseVatDate('2026-11-16', true)?.toISOString(), '2026-11-16T21:59:59.999Z')
  assert.throws(() => parseVatDate('2026-02-30'))
})

test('mixed product tax snapshots conserve a fixed invoice discount', () => {
  const result = calculateSnapshotTax([
    { baseCents: 10000n, eligible: true, snapshot: { taxRate: '14' } },
    { baseCents: 10000n, eligible: true, snapshot: { taxRate: '0' } },
  ], 2000n, '99')
  assert.equal(result.taxCents, 1260n)
  assert.deepEqual(result.lineTaxCents, [1260n, 0n])
  assert.deepEqual(result.taxableCents, [9000n, 9000n])
})

test('legacy items retain the saved invoice tax rate', () => {
  assert.equal(calculateSnapshotTax([{ baseCents: 10000n, eligible: true, snapshot: null }], 0n, '14').taxCents, 1400n)
})

const invoice = {
  id: '1', number: 'INV-1', branchId: '1', branch: 'Main', createdAt: new Date('2026-11-14T10:00:00Z'),
  subtotal: '100', discount: '0', tax: '14', total: '114', taxRate: '14',
  payments: [{ id: '1', status: 'completed', amount: '57', createdAt: new Date('2026-11-15T10:00:00Z') }, { id: '2', status: 'completed', amount: '57', createdAt: new Date('2026-11-16T10:00:00Z') }],
  refunds: [{ id: '1', paymentId: '1', status: 'COMPLETED', amount: '57', executedAt: new Date('2026-11-16T12:00:00Z') }],
}

test('VAT allocates split collection and executed partial refunds with exact cents', () => {
  const result = calculateVat([invoice])
  assert.equal(result.collectedVatCents, 1400)
  assert.equal(result.refundedVatCents, 700)
  assert.equal(result.netVatCents, 700)
  assert.equal(result.excluded.length, 0)
})

test('VAT window includes refunds executed today for an older payment', () => {
  const result = calculateVat([invoice], { from: new Date('2026-11-16T00:00:00Z'), to: new Date('2026-11-16T23:59:59Z') })
  assert.equal(result.collectedVatCents, 700)
  assert.equal(result.refundedVatCents, 700)
  assert.equal(result.netVatCents, 0)
  assert.equal(result.rows.find(row => row.state === 'refunded')?.paymentAt, '2026-11-16T12:00:00.000Z')
})
