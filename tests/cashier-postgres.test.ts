/** Isolated cashier acceptance. Requires the same explicit shared-DB opt-in as financial acceptance. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

const configured = process.env.SKOON_FINANCIAL_TEST_DATABASE_URL
const active = process.env.DATABASE_URL
const acknowledged = process.env.SKOON_FINANCIAL_ACCEPTANCE_SHARED_DATABASE === 'allow-test-fixtures'
const safe = Boolean(configured && active && configured === active && acknowledged)

test('cashier PostgreSQL acceptance is isolated and cleaned up', { skip: safe ? false : 'Explicit shared-development fixture acknowledgement is required.' }, async () => {
  const { prisma } = await import('../src/lib/prisma')
  const { ROLE } = await import('../src/lib/authz')
  const { createPosOrder } = await import('../src/lib/staff-pos-write')
  const { PosError } = await import('../src/lib/staff-pos')
  const { editOpenInvoice, getCashierInvoices, InvoiceError } = await import('../src/lib/staff-invoices')
  const { finalizeOrderPayment, PaymentError } = await import('../src/lib/staff-payments-write')
  const { transitionOrderStatus, OrderError } = await import('../src/lib/staff-orders')
  type Session = import('../src/lib/session').StaffSession
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids = { cashier: randomUUID(), waiter: randomUUID(), outsider: randomUUID() }
  const roles = await prisma.role.findMany({ where: { slug: { in: [ROLE.CASHIER, ROLE.WAITER] } }, select: { id: true, slug: true } })
  const cashierRole = roles.find((x) => x.slug === ROLE.CASHIER); const waiterRole = roles.find((x) => x.slug === ROLE.WAITER)
  if (!cashierRole || !waiterRole) throw new Error('Existing cashier and waiter roles are required')
  const branches: bigint[] = []
  try {
    const branch = await prisma.cafeBranch.create({ data: { name: `Cashier acceptance ${suffix}`, code: `CAS-${suffix}`, timezone: 'Africa/Cairo' } }); branches.push(branch.id)
    const other = await prisma.cafeBranch.create({ data: { name: `Cashier other ${suffix}`, code: `CAO-${suffix}`, timezone: 'Africa/Cairo' } }); branches.push(other.id)
    const category = await prisma.category.create({ data: { branchId: branch.id, name: `Acceptance ${suffix}`, slug: `acceptance-${suffix}` } })
    const product = await prisma.product.create({ data: { branchId: branch.id, categoryId: category.id, name: `Coffee ${suffix}`, price: '25.00' } })
    const unavailable = await prisma.product.create({ data: { branchId: branch.id, categoryId: category.id, name: `Unavailable ${suffix}`, price: '99.00', isAvailable: false } })
    const table = await prisma.cafeTable.create({ data: { branchId: branch.id, number: `A-${suffix}`, publicToken: suffix.padEnd(16, '0') } })
    await prisma.user.createMany({ data: [
      { id: ids.cashier, roleId: cashierRole.id, branchId: branch.id, name: 'Acceptance Cashier' },
      { id: ids.waiter, roleId: waiterRole.id, branchId: branch.id, name: 'Acceptance Waiter' },
      { id: ids.outsider, roleId: cashierRole.id, branchId: other.id, name: 'Acceptance Outsider' },
    ] })
    const shift = await prisma.shift.create({ data: { branchId: branch.id, cashierId: ids.cashier, openBy: 'Acceptance Cashier', status: 'open' } })
    const cashier: Session = { id: ids.cashier, email: null, name: 'Acceptance Cashier', role: ROLE.CASHIER, branchId: branch.id.toString(), permissions: [] }
    const outsider: Session = { id: ids.outsider, email: null, name: 'Acceptance Outsider', role: ROLE.CASHIER, branchId: other.id.toString(), permissions: [] }
    const input = { tableId: table.id.toString(), items: [{ productId: product.id.toString(), qty: 2, price: 0.01 }], total: 0.01 }
    const key = `cashier-${suffix}-create`
    const [first, duplicate] = await Promise.all([createPosOrder(cashier, input, key), createPosOrder(cashier, input, key)])
    assert.deepEqual(first, duplicate); assert.equal(Number(first.total), 50)
    assert.equal(await prisma.order.count({ where: { branchId: branch.id } }), 1)
    const order = await prisma.order.findUniqueOrThrow({ where: { id: BigInt(first.id) }, include: { items: true } })
    assert.equal(Number(order.items[0].unitPrice), 25); assert.equal(Number(order.items[0].lineTotal), 50)
    assert.equal(await prisma.notification.count({ where: { userId: ids.waiter, orderId: order.id, type: 'order.created' } }), 1)
    assert.equal(await prisma.auditLog.count({ where: { branchId: branch.id, action: 'pos.order_create', entityId: order.id } }), 1)
    const attribute = await prisma.productAttribute.create({ data: { branchId: branch.id, name: `Size ${suffix}` } })
    const values = await Promise.all([
      prisma.productAttributeValue.create({ data: { attributeId: attribute.id, label: 'صغير', sortOrder: 1 } }),
      prisma.productAttributeValue.create({ data: { attributeId: attribute.id, label: 'كبير طويل الاسم لاختبار الطباعة الحرارية العربية', sortOrder: 2 } }),
    ])
    const variants = await Promise.all([
      prisma.productVariant.create({ data: { productId: product.id, combinationKey: `size:${values[0].id}`, price: '30.00', values: { create: { valueId: values[0].id } } } }),
      prisma.productVariant.create({ data: { productId: product.id, combinationKey: `size:${values[1].id}`, price: '45.00', values: { create: { valueId: values[1].id } } } }),
    ])
    const variantOrder = await createPosOrder(cashier, { tableId: table.id.toString(), items: [
      { productId: product.id.toString(), variantId: variants[0].id.toString(), qty: 1 },
      { productId: product.id.toString(), variantId: variants[1].id.toString(), qty: 2 },
    ] }, `cashier-${suffix}-variants`)
    assert.equal(variantOrder.total, '120.00')
    const variantInvoice = (await getCashierInvoices(cashier)).find((invoice) => invoice.id === variantOrder.id)
    assert.deepEqual(variantInvoice?.items.map((item) => ({ label: item.variantLabel, unitPrice: item.unitPrice, quantity: item.quantity, lineTotal: item.lineTotal })), [
      { label: 'صغير', unitPrice: '30.00', quantity: 1, lineTotal: '30.00' },
      { label: 'كبير طويل الاسم لاختبار الطباعة الحرارية العربية', unitPrice: '45.00', quantity: 2, lineTotal: '90.00' },
    ])
    await editOpenInvoice(cashier, variantOrder.id, { action: 'line_discount', orderItemId: variantInvoice!.items[1].id, discountType: 'amount', discountValue: '10.00', eligibleForInvoiceDiscount: true })
    await editOpenInvoice(cashier, variantOrder.id, { action: 'financials', discountType: 'percentage', discountValue: '10', notes: '' })
    const discountedVariantInvoice = (await getCashierInvoices(cashier)).find((invoice) => invoice.id === variantOrder.id)
    assert.equal(discountedVariantInvoice?.items[1].discountAmount, '10.00')
    assert.equal(discountedVariantInvoice?.total, '99.00')
    await finalizeOrderPayment(cashier, variantOrder.id, { method: 'cash', received: 100, idempotencyKey: `cashier-${suffix}-variants-pay` })
    const settledVariantInvoice = (await getCashierInvoices(cashier)).find((invoice) => invoice.id === variantOrder.id)
    assert.equal(settledVariantInvoice?.remaining, '0.00')
    assert.deepEqual(settledVariantInvoice?.items.map((item) => item.variantLabel), ['صغير', 'كبير طويل الاسم لاختبار الطباعة الحرارية العربية'])
    await assert.rejects(() => createPosOrder(cashier, { ...input, items: [{ productId: product.id.toString(), qty: 1 }] }, key), (e: unknown) => e instanceof Error && /Idempotency/.test(e.message))
    await assert.rejects(() => createPosOrder(cashier, { tableId: table.id.toString(), items: [{ productId: unavailable.id.toString(), qty: 1 }] }, `cashier-${suffix}-bad`), (e: unknown) => e instanceof Error)
    await assert.rejects(() => editOpenInvoice(outsider, first.id, { action: 'quantity', orderItemId: order.items[0].id.toString(), quantity: 1 }), (e: unknown) => e instanceof InvoiceError && e.status === 404)
    await editOpenInvoice(cashier, first.id, { action: 'quantity', orderItemId: order.items[0].id.toString(), quantity: 3 })
    assert.equal(Number((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).total), 75)
    const payment = await finalizeOrderPayment(cashier, first.id, { method: 'cash', received: 80, idempotencyKey: `cashier-${suffix}-pay` })
    assert.equal(payment.amount, '75.00'); assert.equal(await prisma.payment.count({ where: { orderId: order.id, status: 'completed' } }), 1)
    await assert.rejects(() => editOpenInvoice(cashier, first.id, { action: 'quantity', orderItemId: order.items[0].id.toString(), quantity: 2 }), (e: unknown) => e instanceof InvoiceError && e.status === 409)
    await assert.rejects(() => transitionOrderStatus(cashier, first.id, 'cancelled', 'cannot cancel paid'), (e: unknown) => e instanceof OrderError && e.status === 409)
    const invoices = await getCashierInvoices(cashier); assert.equal(invoices.find((x) => x.id === first.id)?.remaining, '0.00')
    await prisma.shift.update({ where: { id: shift.id }, data: { status: 'closed', closedAt: new Date() } })
    await assert.rejects(() => createPosOrder(cashier, input, `cashier-${suffix}-closed`), (e: unknown) => e instanceof PosError && e.status === 409)
    await assert.rejects(() => finalizeOrderPayment(cashier, first.id, { method: 'cash', idempotencyKey: `cashier-${suffix}-second` }), (e: unknown) => e instanceof PaymentError && e.status === 409)
  } finally {
    if (branches.length) {
      await prisma.financialOperation.deleteMany({ where: { branchId: { in: branches } } }); await prisma.auditLog.deleteMany({ where: { branchId: { in: branches } } })
      await prisma.order.deleteMany({ where: { branchId: { in: branches } } }); await prisma.shift.deleteMany({ where: { branchId: { in: branches } } })
      await prisma.productVariantValue.deleteMany({ where: { variant: { product: { branchId: { in: branches } } } } }); await prisma.productVariant.deleteMany({ where: { product: { branchId: { in: branches } } } })
      await prisma.productAttributeValue.deleteMany({ where: { attribute: { branchId: { in: branches } } } }); await prisma.productAttribute.deleteMany({ where: { branchId: { in: branches } } })
      await prisma.product.deleteMany({ where: { branchId: { in: branches } } }); await prisma.category.deleteMany({ where: { branchId: { in: branches } } }); await prisma.cafeTable.deleteMany({ where: { branchId: { in: branches } } })
      await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } }); await prisma.cafeBranch.deleteMany({ where: { id: { in: branches } } })
      assert.equal(await prisma.cafeBranch.count({ where: { id: { in: branches } } }), 0)
    }
    await prisma.$disconnect()
  }
})
