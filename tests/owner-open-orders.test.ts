import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'
import * as authz from '../src/lib/authz'
import { selectOwnerOpenOrders } from '../src/lib/owner-open-orders'
import type { InvoiceRow } from '../src/lib/staff-invoices'
import { NextResponse } from 'next/server'
import { financialDayBoundary } from '../src/lib/financial-calendar'
import { resolveInvoiceRange } from '../src/lib/owner-invoice-view'

const invoice = (overrides: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: '1', number: 'OPEN-1', createdAt: '2026-11-16T10:00:00Z', branch: 'Branch', table: '1', creator: 'Waiter', cashier: null,
  status: 'new', paymentStatus: 'unpaid', subtotal: '100.00', discount: '0.00', tax: '0.00', total: '100.00', paid: '0.00', remaining: '100.00',
  cancelledAt: null, cancelReason: null, isArchived: false, items: [], payments: [], ...overrides,
})

test('Owner orders include open and partially paid invoices, including served/unpaid, across all dates', () => {
  const orders = [invoice(), invoice({ id: '2', status: 'served', createdAt: '2025-01-01T10:00:00Z', paid: '75.00', remaining: '25.00', paymentStatus: 'partial' })]
  assert.deepEqual(selectOwnerOpenOrders(orders).map(order => order.id), ['1', '2'])
})

test('Owner orders exclude paid, zero-balance, cancelled and archived invoices', () => {
  assert.deepEqual(selectOwnerOpenOrders([
    invoice({ id: 'paid', status: 'preparing', paymentStatus: 'paid', paid: '100.00', remaining: '0.00' }),
    invoice({ id: 'cancelled', status: 'cancelled' }),
    invoice({ id: 'deleted', isArchived: true }),
    invoice({ id: 'free', total: '0.00', remaining: '0.00' }),
  ]), [])
})

test('Owner order query searches invoice number, table, branch and creator after settlement filtering', () => {
  const orders = [invoice(), invoice({ id: '2', number: 'PAID-2', remaining: '0.00' })]
  for (const query of ['open-1', 'Branch', 'Waiter']) assert.equal(selectOwnerOpenOrders(orders, query).length, 1)
  assert.equal(selectOwnerOpenOrders(orders, 'paid-2').length, 0)
})

test('Owner /orders renders the read-only open-order view instead of kitchen/payment controls', async () => {
  const source = readFileSync('src/app/(app)/orders/page.tsx', 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const OwnerBoard = () => null, OtherBoard = () => null
  const exports: any = {}
  const fixtures = [invoice(), invoice({ id: '2', remaining: '0.00', paymentStatus: 'paid' })]
  const require = (name: string) => {
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === 'next/navigation') return { redirect: () => { throw new Error('Unexpected redirect') } }
    if (name === '@/lib/require-page-access') return { requirePageAccess: async () => ({ role: 'owner', branchId: null }) }
    if (name === '@/lib/staff-orders') return { listStaffOrders: async () => { throw new Error('Owner must not use capped kitchen/status order listing') } }
    if (name === '@/lib/staff-invoices') return { getCashierInvoices: async () => fixtures }
    if (name === '@/lib/owner-open-orders') return { selectOwnerOpenOrders }
    if (name === '@/lib/authz') return authz
    if (name === '@/lib/staff-shifts') return { getOpenShift: async () => null }
    if (name === '@/components/owner/owner-open-orders-board') return { OwnerOpenOrdersBoard: OwnerBoard }
    if (name === '@/components/orders/orders-board') return { OrdersBoard: OtherBoard }
    throw new Error(`Unexpected import: ${name}`)
  }
  new Function('require', 'exports', 'module', compiled)(require, exports, { exports })
  const result = await exports.default({ searchParams: Promise.resolve({ selected: '2' }) })
  assert.equal(result.type, OwnerBoard)
  assert.deepEqual(result.props.invoices.map((row: InvoiceRow) => row.id), ['1'])
})

test('paid invoice CSV excludes archived invoices and uses Cairo creation-date bounds', async () => {
  const compiled = ts.transpileModule(readFileSync('src/app/api/staff/invoices/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  let bounds: any
  const exports: any = {}
  const require = (name: string) => {
    if (name === 'next/server') return { NextResponse }
    if (name === '@/lib/financial-calendar') return { financialDayBoundary }
    if (name === '@/lib/owner-invoice-view') return { resolveInvoiceRange }
    if (name === '@/lib/session') return { getStaffSession: async () => ({ role: 'owner', branchId: null }) }
    if (name === '@/lib/staff-invoices') return { getCashierInvoices: async (_session: unknown, range: unknown) => { bounds = range; return [invoice({ number: 'CURRENT-PAID', remaining: '0.00', paid: '100.00' }), invoice({ number: 'ARCHIVED-PAID', remaining: '0.00', isArchived: true })] } }
    throw new Error(`Unexpected import: ${name}`)
  }
  new Function('require', 'exports', 'module', compiled)(require, exports, { exports })
  const response = await exports.GET(new Request('http://localhost/api/staff/invoices?format=csv&from=2026-11-16&to=2026-11-16'))
  assert.equal(response.status, 200)
  const csv = await response.text()
  assert.ok(csv.includes('CURRENT-PAID'))
  assert.equal(csv.includes('ARCHIVED-PAID'), false)
  assert.equal(bounds.from.toISOString(), '2026-11-15T22:00:00.000Z')
  assert.equal(bounds.to.toISOString(), '2026-11-16T21:59:59.999Z')
})
