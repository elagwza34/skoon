import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ROLE, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { PosError, posOrderSchema } from '@/lib/staff-pos'
import { notifyRole } from '@/lib/notifications'
import { getOpenShift } from '@/lib/staff-shifts'
import { createOrderItemVariantSnapshot } from '@/lib/order-item-variant'
import { calculateInvoiceDiscounts, type DiscountKind } from '@/lib/invoice-discounts'

export type PosOrderResult = { id: string; orderNumber: string; orderType: 'dine_in' | 'takeaway'; total: string; itemsCount: number }

function moneyCents(value: number) { return BigInt(Math.round(value * 100)) }
function centsText(value: bigint) { return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}` }

/**
 * Staff POS order creation — server-side pricing, one transaction.
 * Cashier+ and waiter (own branch). Kitchen is forbidden.
 */
export async function createPosOrder(session: StaffSession, input: unknown, idempotencyKey?: string | null) {
  if (session.role === ROLE.KITCHEN) throw new PosError('Forbidden', 403)
  const parsed = posOrderSchema.safeParse(input)
  if (!parsed.success) throw new PosError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)

  // Waiter restrictions: no takeaway, no discounts
  if (session.role === ROLE.WAITER) {
    if (parsed.data.orderType === 'takeaway') throw new PosError('النادل لا يمكنه إنشاء طلبات تيك أواي', 403)
    if (parsed.data.discountType !== undefined) throw new PosError('النادل لا يمكنه تطبيق خصومات', 403)
    for (const item of parsed.data.items) {
      if (item.discountType !== undefined) throw new PosError('النادل لا يمكنه تطبيق خصومات على الأصناف', 403)
    }
  }

  const branchId =
    session.role === ROLE.OWNER
      ? await resolveOwnerBranch(session, parsed.data.tableId)
      : BigInt(session.branchId as string)
  const key = idempotencyKey?.trim() || null
  if (key && (key.length < 8 || key.length > 100)) throw new PosError('Invalid idempotency key', 400)

  // Operational roles need a reconcilable shift. Supervisors may act without
  // one; their authorized order is deliberately not attributed to a till.
  const openShift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, branchId) : null
  if (requiresOperationalShift(session.role) && !openShift) {
    throw new PosError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)
  }

  let tableId: bigint
  if (parsed.data.tableId) {
    const table = await prisma.cafeTable.findFirst({
      where: { id: BigInt(parsed.data.tableId), branchId, isActive: true, deletedAt: null },
      select: { id: true },
    })
    if (!table) throw new PosError('الطاولة غير موجودة في هذا الفرع', 404)
    tableId = table.id
  } else if (parsed.data.orderType === 'takeaway' || session.role !== ROLE.OWNER) {
    // The deployed schema still has a required legacy table FK. Takeaway never
    // asks the cashier for a table and never presents this internal anchor.
    const firstTable = await prisma.cafeTable.findFirst({
      where: { branchId, isActive: true, deletedAt: null },
      orderBy: { number: 'asc' },
      select: { id: true },
    })
    if (!firstTable) throw new PosError('لا توجد طاولات نشطة في الفرع', 400)
    tableId = firstTable.id
  } else {
    throw new PosError('اختر الطاولة', 400)
  }

  const fingerprint = createHash('sha256').update(JSON.stringify({
    branchId: branchId.toString(), tableId: tableId.toString(), orderType: parsed.data.orderType, customerName: parsed.data.customerName?.trim() || null, customerPhone: parsed.data.customerPhone?.trim() || null, notes: parsed.data.notes?.trim() || null,
    discountType: parsed.data.discountType ?? null, discountValue: parsed.data.discountValue ?? 0,
    items: parsed.data.items.map((item) => ({ productId: item.productId, variantId: item.variantId ?? null, modifierSelections: item.modifierSelections, qty: item.qty, note: item.note?.trim() || null, discountType: item.discountType ?? null, discountValue: item.discountValue ?? 0 })),
  })).digest('hex')
  // A completed retry remains retrievable even if a product was later disabled.
  if (key) {
    const prior = await prisma.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType: 'pos_order_create', idempotencyKey: key } } })
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new PosError('Idempotency key was reused with a different request', 409)
      return prior.result as unknown as PosOrderResult
    }
  }

  const productIds = [...new Set(parsed.data.items.map((i) => BigInt(i.productId)))]
  const variantIds = [...new Set(parsed.data.items.map((i) => i.variantId).filter(Boolean) as string[])].map(BigInt)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, branchId, isActive: true, deletedAt: null, isAvailable: true },
    select: {
      id: true, name: true, price: true,
      variants: { where: { isActive: true, isAvailable: true, archivedAt: null }, select: { id: true }, take: 1 },
      optionAssignments: { select: { productOption: { select: { id: true, name: true, type: true, isRequired: true, minSelections: true, maxSelections: true, isActive: true, values: { where: { isActive: true, deletedAt: null }, select: { id: true, value: true, priceAdjustment: true } } } } } },
    },
  })
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds }, productId: { in: productIds }, isActive: true, isAvailable: true, archivedAt: null },
        select: { id: true, productId: true, price: true, combinationKey: true, values: { select: { value: { select: { label: true, attribute: { select: { name: true, sortOrder: true } } } } } } },
      })
    : []
  const priceById = new Map(products.map((p) => [p.id.toString(), p]))
  const variantById = new Map(variants.map((variant) => [variant.id.toString(), variant]))
  for (const item of parsed.data.items) {
    if (!priceById.has(item.productId)) throw new PosError('تغيّرت القائمة — حدّث الصفحة', 400)
    const variant = item.variantId ? variantById.get(item.variantId) : null
    if (!item.variantId && priceById.get(item.productId)!.variants.length) throw new PosError('اختر متغير المنتج', 400)
    if (item.variantId && (!variant || variant.productId.toString() !== item.productId)) throw new PosError('المتغير غير متوفر', 400)
  }

  for (const item of parsed.data.items) validateModifierSelections(priceById.get(item.productId)!, item.modifierSelections)

  const lines = parsed.data.items.map((item) => {
    const p = priceById.get(item.productId)!
    const variant = item.variantId ? variantById.get(item.variantId)! : null
    const modifiers = resolveModifierSelections(p, item.modifierSelections)
    const unitCents = moneyCents(Number(variant?.price ?? p.price)) + modifiers.reduce((sum, selection) => sum + moneyCents(Number(selection.priceAdjustment)), 0n)
    if (unitCents < 0n) throw new PosError('سعر المنتج بعد الإضافات غير صالح', 400)
    const unitPrice = centsText(unitCents)
    return {
      productId: p.id, productVariantId: variant?.id ?? null, productName: p.name, unitPrice,
      productVariantSnapshot: variant ? createOrderItemVariantSnapshot(variant.combinationKey, variant.values.map((entry) => entry.value)) : null,
      optionsSnapshot: { version: 1, groups: modifiers.map((selection) => ({ groupId: selection.groupId.toString(), groupName: selection.groupName, optionId: selection.optionId.toString(), optionLabel: selection.optionLabel, priceAdjustment: selection.priceAdjustment.toString() })) },
      modifiers,
      quantity: item.qty, lineTotal: Number(unitPrice) * item.qty,
      notes: item.note?.trim() || null,
      discountType: item.discountType ?? null,
      discountValue: item.discountValue ?? 0,
    }
  })

  const invoiceDiscountType: DiscountKind = parsed.data.discountType ?? 'none'
  const calculated = calculateInvoiceDiscounts(lines.map((line) => ({
    unitCents: moneyCents(Number(line.unitPrice)), quantity: line.quantity,
    discountType: line.discountType ?? 'none',
    discountValue: line.discountType === 'amount' ? moneyCents(line.discountValue) : BigInt(Math.round(line.discountValue)),
    eligibleForInvoiceDiscount: true,
  })), invoiceDiscountType, invoiceDiscountType === 'amount' ? moneyCents(parsed.data.discountValue ?? 0) : BigInt(Math.round(parsed.data.discountValue ?? 0)))

  const orderNumber = `POS-${Date.now().toString(36).toUpperCase()}`
  const orderRef = randomBytes(12).toString('hex')
  const subtotal = centsText(calculated.subtotalCents)
  const total = centsText(calculated.finalCents)

  const created = await prisma.$transaction(async (tx) => {
    // The lock makes the read/check/create sequence safe when a client retries
    // the same submission concurrently. The durable record commits with the order.
    if (key) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pos-order:' || ${branchId.toString()} || ':' || ${session.id} || ':' || ${key}))`
      const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType: 'pos_order_create', idempotencyKey: key } } })
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new PosError('Idempotency key was reused with a different request', 409)
        return prior.result as unknown as PosOrderResult
      }
    }
    const order = await tx.order.create({
      data: {
        branchId, cafeTableId: tableId,
        orderNumber, orderRef, orderType: parsed.data.orderType, status: 'new', source: session.role === ROLE.WAITER ? 'waiter' : 'pos',
        customerName: parsed.data.customerName?.trim() || null,
        customerPhone: parsed.data.customerPhone?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
        createdById: session.id,
        // A waiter-created ticket is immediately their responsibility. The
        // immutable creator remains separate for audit and historical reports.
        responsibleWaiterId: session.role === ROLE.WAITER ? session.id : null,
        shiftId: openShift?.id ?? null,
        itemsSubtotal: subtotal,
        itemDiscountAmount: centsText(calculated.itemDiscountCents),
        discountEligibleBase: centsText(calculated.eligibleBaseCents),
        discountType: invoiceDiscountType === 'none' ? null : invoiceDiscountType,
        discountValue: invoiceDiscountType === 'amount' ? Number(parsed.data.discountValue ?? 0).toFixed(2) : String(parsed.data.discountValue ?? 0),
        discountAmount: centsText(calculated.itemDiscountCents + calculated.invoiceDiscountCents), taxAmount: '0',
        total, paymentStatus: 'unpaid',
        items: {
          create: lines.map((l) => ({
            productId: l.productId, productVariantId: l.productVariantId, productName: l.productName,
            unitPrice: l.unitPrice, quantity: l.quantity,
            lineTotal: centsText(calculated.lineTotals[lines.indexOf(l)].afterDiscountCents),
            discountType: l.discountType, discountValue: l.discountType === 'amount' ? Number(l.discountValue).toFixed(2) : String(l.discountValue),
            discountAmount: centsText(calculated.lineTotals[lines.indexOf(l)].itemDiscountCents),
            ...(l.productVariantSnapshot ? { productVariantSnapshot: l.productVariantSnapshot } : {}), optionsSnapshot: l.optionsSnapshot,
            options: { create: l.modifiers.map((selection) => ({ productOptionId: selection.groupId, optionValueId: selection.optionId, optionName: selection.groupName, valueLabel: selection.optionLabel, priceAdjustment: selection.priceAdjustment.toString() })) },
            notes: l.notes,
          })),
        },
        statusHistory: { create: { toStatus: 'new', changedById: session.id } },
      },
      select: { id: true, orderNumber: true, total: true },
    })
    if (session.role === ROLE.WAITER) {
      await tx.orderResponsibilityHistory.create({
        data: { orderId: order.id, branchId, assignedToId: session.id, assignedById: session.id, source: 'manual_create', reason: 'Manual waiter order creation' },
      })
    }
    // Ring the branch's waiters — a new POS order needs their attention (or, if
    // the waiter placed it themselves, it still shows on their own board).
    await notifyRole(tx, ROLE.WAITER, branchId, {
      type: 'order.created',
      title: `طلب جديد ${order.orderNumber}`,
      orderId: order.id,
    })
    const result = {
      id: order.id.toString(), orderNumber: order.orderNumber,
      orderType: parsed.data.orderType, total: order.total.toString(), itemsCount: lines.reduce((n, l) => n + l.quantity, 0),
    }
    if (key) await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType: 'pos_order_create', idempotencyKey: key, fingerprint, result } })
    await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'pos.order_create', entityType: 'order', entityId: order.id, newValues: { orderNumber: order.orderNumber, total: order.total.toString(), itemsCount: result.itemsCount } } })
    return result
  })

  return created
}

type ProductWithModifiers = {
  optionAssignments: Array<{ productOption: { id: bigint; name: string; type: string; isRequired: boolean; minSelections: number; maxSelections: number; isActive: boolean; values: Array<{ id: bigint; value: string; priceAdjustment: { toString(): string } }> } }>
}

function validateModifierSelections(product: ProductWithModifiers, input: Array<{ groupId: string; valueIds: string[] }>) {
  const submitted = new Map<string, string[]>()
  for (const selection of input) {
    if (submitted.has(selection.groupId)) throw new PosError('لا يمكن تكرار مجموعة الإضافات', 400)
    submitted.set(selection.groupId, selection.valueIds)
  }
  const groups = new Map(product.optionAssignments.map((assignment) => [assignment.productOption.id.toString(), assignment.productOption]))
  for (const groupId of submitted.keys()) if (!groups.get(groupId)?.isActive) throw new PosError('مجموعة إضافات غير متاحة لهذا المنتج', 400)
  for (const group of groups.values()) {
    if (!group.isActive) continue
    const values = submitted.get(group.id.toString()) ?? []
    if (new Set(values).size !== values.length) throw new PosError('لا يمكن تكرار نفس الإضافة', 400)
    const minimum = group.isRequired ? Math.max(1, group.minSelections) : group.minSelections
    const maximum = group.type === 'single' ? 1 : group.maxSelections
    if (values.length < minimum || values.length > maximum) throw new PosError(`اختيارات ${group.name} غير مكتملة`, 400)
    const allowed = new Set(group.values.map((value) => value.id.toString()))
    if (values.some((value) => !allowed.has(value))) throw new PosError(`اختيار غير متاح في ${group.name}`, 400)
  }
}

function resolveModifierSelections(product: ProductWithModifiers, input: Array<{ groupId: string; valueIds: string[] }>) {
  const groups = new Map(product.optionAssignments.map((assignment) => [assignment.productOption.id.toString(), assignment.productOption]))
  return input.flatMap((selection) => {
    const group = groups.get(selection.groupId)!
    const values = new Map(group.values.map((value) => [value.id.toString(), value]))
    return selection.valueIds.map((id) => {
      const option = values.get(id)!
      return { groupId: group.id, groupName: group.name, optionId: option.id, optionLabel: option.value, priceAdjustment: option.priceAdjustment }
    })
  })
}

async function resolveOwnerBranch(session: StaffSession, tableIdRaw?: string): Promise<bigint> {
  if (tableIdRaw) {
    const table = await prisma.cafeTable.findUnique({
      where: { id: BigInt(tableIdRaw) }, select: { branchId: true },
    })
    if (!table) throw new PosError('الطاولة غير موجودة', 404)
    if (!staffCanAccessBranch(session, table.branchId)) throw new PosError('Forbidden', 403)
    return table.branchId
  }
  const first = await prisma.cafeTable.findFirst({
    where: { isActive: true, deletedAt: null }, orderBy: { id: 'asc' }, select: { branchId: true },
  })
  if (!first) throw new PosError('لا توجد طاولات نشطة', 400)
  return first.branchId
}
