import test from 'node:test'
import assert from 'node:assert/strict'
import { cairoDateKey, invoiceBucket, invoiceView, resolveInvoiceRange } from '../src/lib/owner-invoice-view'

const invoice = (overrides = {}) => ({ number: 'INV-1', creator: 'Ali', createdAt: '2026-11-15T23:00:00Z', status: 'open', isArchived: false, total: '100.10', remaining: '25.05', ...overrides })

test('Cairo creation dates and presets use inclusive calendar ranges', () => {
  const now = new Date('2026-11-15T23:00:00Z')
  assert.equal(cairoDateKey(now), '2026-11-16')
  assert.deepEqual(resolveInvoiceRange('day', '', '', now), { from: '2026-11-16', to: '2026-11-16', error: null })
  assert.equal(resolveInvoiceRange('week', '', '', now).from, '2026-11-10')
  assert.equal(resolveInvoiceRange('month', '', '', now).from, '2026-11-01')
  assert.deepEqual(resolveInvoiceRange('all', '', '', now), { from: '', to: '', error: null })
})

test('invalid custom dates and reversed ranges never produce data', () => {
  for (const [from, to] of [['2026-02-30', '2026-03-01'], ['2026-11-17', '2026-11-16'], ['', '2026-11-16']]) {
    const range = resolveInvoiceRange('custom', from, to)
    assert.ok(range.error)
    assert.equal(invoiceView([invoice()], range, 'open', '').rows.length, 0)
  }
})

test('custom ranges enforce the same 366-calendar-day limit as paid export', () => {
  assert.equal(resolveInvoiceRange('custom', '2025-01-01', '2026-01-01').error, null)
  assert.ok(resolveInvoiceRange('custom', '2025-01-01', '2026-01-02').error)
})

test('exclusive archived/cancelled/settled/open buckets agree with displayed status', () => {
  assert.equal(invoiceBucket(invoice({ isArchived: true, status: 'cancelled' })), 'deleted')
  assert.equal(invoiceBucket(invoice({ status: 'cancelled', remaining: '0.00' })), 'cancelled')
  assert.equal(invoiceBucket(invoice({ status: 'completed', remaining: '0.00' })), 'paid')
  assert.equal(invoiceBucket(invoice()), 'open')
})

test('range filters cards and rows; search affects rows only; totals use exact cents', () => {
  const range = resolveInvoiceRange('custom', '2026-11-16', '2026-11-16')
  const data = [invoice(), invoice({ remaining: '0.00' }), invoice({ status: 'cancelled' }), invoice({ isArchived: true }), invoice({ createdAt: '2026-11-14T10:00:00Z' }), invoice({ number: 'INV-2', total: '0.20', remaining: '0.00' })]
  const result = invoiceView(data, range, 'paid', 'INV-2')
  assert.equal(result.rows.length, 1)
  assert.deepEqual(result.cards.paid, { count: 2, amount: '100.30' })
  assert.deepEqual(result.cards.open, { count: 1, amount: '25.05' })
  assert.deepEqual(result.cards.cancelled, { count: 1, amount: '100.10' })
  assert.deepEqual(result.cards.deleted, { count: 1, amount: '100.10' })
  assert.doesNotThrow(() => JSON.stringify(result))
})
