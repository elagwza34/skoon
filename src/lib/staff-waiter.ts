import { prisma } from '@/lib/prisma'
import { ROLE, requiresOperationalShift } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import type { StaffOrderRow } from '@/lib/staff-orders'
import { getOpenShift, ShiftError } from '@/lib/staff-shifts'
import { orderedVariantLabels, resolveOrderItemVariantLabels } from '@/lib/order-item-variant'

/**
 * Waiter workspace — branch tables + open orders + POS catalog.
 * All real DB. Server-only.
 * Requires the waiter to have an open shift for their branch.
 */
export type WaiterOrderRow = StaffOrderRow & {
  /** Current operational owner; distinct from immutable order.createdById. */
  responsibleWaiterId: string | null
  responsibleWaiterName: string | null
}

export interface IncomingWaiterHandover {
  id: string
  senderName: string
  requestedAt: string
  notes: string | null
  outstandingOrders: { id: string; number: string; tableNumber: string; status: string }[]
}

export interface WaiterWorkspace {
  currentUserId: string
  branchId: string
  branchName: string
  employeeName: string
  shift: { id: string; openedAt: string } | null
  tables: { id: string; number: string; name: string | null; capacity: number; openOrders: number }[]
  openOrders: WaiterOrderRow[]
  categories: { id: string; name: string }[]
  products: { id: string; name: string; price: string; categoryId: string; isAvailable: boolean }[]
  incomingHandovers: IncomingWaiterHandover[]
}

/**
 * Owner-only operational overview. This is deliberately a separate shape from
 * WaiterWorkspace: it carries no catalog, shift, handover, or mutation state.
 * The owner route consumes it only to render a read-only monitor.
 */
export interface OwnerWaiterMonitor {
  orders: {
    id: string
    number: string
    branchName: string
    tableNumber: string
    status: string
    source: string
    createdAt: string
    qrApprovedAt: string | null
    responsibleWaiterName: string | null
    itemsCount: number
    servedItemsCount: number
  }[]
  tables: { id: string; branchName: string; number: string; name: string | null; activeOrders: number }[]
  serviceRequests: {
    id: string
    branchName: string
    tableNumber: string
    type: string
    status: string
    priority: number
    createdAt: string
    claimedAt: string | null
    resolvedAt: string | null
    claimedByName: string | null
    resolvedByName: string | null
  }[]
}

export function canViewOwnerWaiterMonitor(role: string): boolean {
  return role === ROLE.OWNER
}

/** Only active, non-terminal orders occupy a table in the waiter workspace. */
export function isWaiterTableOrderActive(status: string): boolean {
  return status === 'new' || status === 'preparing' || status === 'ready'
}

/** A deployment/schema fault, not an authorization or shift failure. */
export class WaiterSchemaError extends Error {
  constructor() {
    super('Waiter handover schema is unavailable. Apply the approved database migration before using waiter operations.')
    this.name = 'WaiterSchemaError'
  }
}

/** Keeps the database fault explicit without exposing a database stack trace. */
export function isMissingWaiterHandoverTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const prismaError = error as { code?: unknown; meta?: { table?: unknown; modelName?: unknown } }
  if (prismaError.code !== 'P2021') return false
  const target = `${String(prismaError.meta?.table ?? '')} ${String(prismaError.meta?.modelName ?? '')}`.toLowerCase()
  return target.includes('waiter_shift_handovers') || target.includes('waitershifthandover')
}

export async function getWaiterWorkspace(session: StaffSession): Promise<WaiterWorkspace> {
  // Waiter must have an open shift before performing waiter duties.
  if (session.branchId === null) throw new ShiftError('غير مصرح — لا فرع مرتبط بالمستخدم', 403)
  const shift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, BigInt(session.branchId)) : null
  if (requiresOperationalShift(session.role) && !shift) throw new ShiftError('لا توجد وردية مفتوحة لهذا الويتر — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)

  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }
  const branchId = BigInt(session.branchId)

  let loaded: Awaited<ReturnType<typeof loadWaiterWorkspaceData>>
  try {
    loaded = await loadWaiterWorkspaceData(session, branchScope, branchId)
  } catch (error) {
    if (isMissingWaiterHandoverTableError(error)) throw new WaiterSchemaError()
    throw error
  }
  const [branch, tables, orders, categories, products, incomingHandovers] = loaded

  const openByTable = new Map<string, number>()
  for (const o of orders) {
    if (!isWaiterTableOrderActive(o.status)) continue
    const key = o.cafeTable.number
    openByTable.set(key, (openByTable.get(key) ?? 0) + 1)
  }

  return {
    currentUserId: session.id,
    branchId: session.branchId,
    branchName: branch?.name ?? '—',
    employeeName: session.name,
    shift: shift ? { id: shift.id.toString(), openedAt: shift.openedAt.toISOString() } : null,
    tables: tables.map((t) => ({
      id: t.id.toString(), number: t.number, name: t.name, capacity: t.capacity,
      openOrders: openByTable.get(t.number) ?? 0,
    })),
    openOrders: orders.map((o) => ({
      id: o.id.toString(), number: o.orderNumber, status: o.status,
      paymentStatus: o.paymentStatus, orderType: o.orderType,
      total: Number(o.total), customerName: o.customerName, source: o.source, orderNotes: o.notes,
      tableNumber: o.cafeTable.number, createdAt: o.createdAt.toISOString(),
      sentToKitchen: o.sentToKitchenAt != null,
      sentToKitchenAt: o.sentToKitchenAt?.toISOString() ?? null,
      cancelReason: o.cancelReason ?? null,
      responsibleWaiterId: o.responsibleWaiterId,
      responsibleWaiterName: o.responsibleWaiter?.name ?? null,
      items: o.items.map((i) => { const labels = i.productVariantId || i.productVariantSnapshot ? resolveOrderItemVariantLabels(i.productVariantSnapshot, orderedVariantLabels(i.productVariant?.values.map((entry) => entry.value) ?? [])) : []; return { id: i.id.toString(), productId: i.productId.toString(), name: i.productName, variantLabel: labels.length ? labels.join(' · ') : null, qty: i.quantity, servedQty: i.servedQuantity, preparedQty: i.preparedQuantity, preparationStartedAt: i.preparationStartedAt?.toISOString() ?? null, unitPrice: Number(i.unitPrice), note: i.notes } }),
      itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
    })),
    categories: categories.map((c) => ({ id: c.id.toString(), name: c.name })),
    products: products.map((p) => ({
      id: p.id.toString(), name: p.name, price: p.price.toString(),
      categoryId: p.categoryId.toString(), isAvailable: p.isAvailable,
    })),
    incomingHandovers: incomingHandovers.map((handover) => ({
      id: handover.id.toString(), senderName: handover.requestedBy.name,
      requestedAt: handover.createdAt.toISOString(), notes: handover.notes,
      outstandingOrders: orders.filter((order) => order.responsibleWaiterId === handover.requestedById && isWaiterTableOrderActive(order.status)).map((order) => ({
        id: order.id.toString(), number: order.orderNumber, tableNumber: order.cafeTable.number, status: order.status,
      })),
    })),
  }
}

function loadWaiterWorkspaceData(session: StaffSession, branchScope: { branchId: bigint } | {}, branchId: bigint) {
  return Promise.all([
    prisma.cafeBranch.findUnique({ where: { id: branchId }, select: { name: true } }),
    prisma.cafeTable.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, name: true, capacity: true },
    }),
    prisma.order.findMany({
      where: { ...branchScope, status: { in: ['new', 'preparing', 'ready', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, orderNumber: true, status: true, paymentStatus: true, orderType: true, total: true, customerName: true,
        source: true, notes: true, createdAt: true, sentToKitchenAt: true, cancelReason: true, responsibleWaiterId: true,
        responsibleWaiter: { select: { name: true } },
        cafeTable: { select: { number: true } },
        items: {
          where: { isVoided: false }, orderBy: { id: 'asc' },
          select: { id: true, productId: true, productName: true, productVariantId: true, productVariantSnapshot: true, productVariant: { select: { values: { select: { value: { select: { label: true, attribute: { select: { sortOrder: true } } } } } } } }, quantity: true, servedQuantity: true, preparedQuantity: true, preparationStartedAt: true, unitPrice: true, notes: true },
        },
      },
    }),
    prisma.category.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, price: true, categoryId: true, isAvailable: true },
    }),
    prisma.waiterShiftHandover.findMany({
      where: { recipientWaiterId: session.id, branchId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, requestedById: true, createdAt: true, notes: true, requestedBy: { select: { name: true } } },
    }),
  ])
}


/** Read-only, bounded operational overview for the Owner monitor. */
export async function getOwnerWaiterMonitor(session: StaffSession): Promise<OwnerWaiterMonitor> {
  if (!canViewOwnerWaiterMonitor(session.role)) throw new ShiftError('Owner access is required', 403)

  const activeStatuses = ['new', 'preparing', 'ready']
  const [orders, tables, serviceRequests] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: [...activeStatuses, 'served'] }, isArchived: false },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, orderNumber: true, status: true, source: true, createdAt: true,
        qrApprovedAt: true, responsibleWaiter: { select: { name: true } },
        branch: { select: { name: true } }, cafeTable: { select: { number: true } },
        items: { where: { isVoided: false }, select: { quantity: true, servedQuantity: true } },
      },
    }),
    prisma.cafeTable.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ branch: { name: 'asc' } }, { sortOrder: 'asc' }, { number: 'asc' }],
      take: 250,
      select: {
        id: true, number: true, name: true, branch: { select: { name: true } },
        orders: { where: { status: { in: activeStatuses } }, select: { id: true } },
      },
    }),
    prisma.serviceRequest.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true, type: true, status: true, priority: true, createdAt: true, claimedAt: true, resolvedAt: true,
        branch: { select: { name: true } }, table: { select: { number: true } },
        claimedBy: { select: { name: true } }, resolvedBy: { select: { name: true } },
      },
    }),
  ])

  return {
    orders: orders.map((order) => ({
      id: order.id.toString(), number: order.orderNumber, branchName: order.branch.name,
      tableNumber: order.cafeTable.number, status: order.status, source: order.source,
      createdAt: order.createdAt.toISOString(), qrApprovedAt: order.qrApprovedAt?.toISOString() ?? null,
      responsibleWaiterName: order.responsibleWaiter?.name ?? null,
      itemsCount: order.items.reduce((total, item) => total + item.quantity, 0),
      servedItemsCount: order.items.reduce((total, item) => total + item.servedQuantity, 0),
    })),
    tables: tables.map((table) => ({
      id: table.id.toString(), branchName: table.branch.name, number: table.number,
      name: table.name, activeOrders: table.orders.length,
    })),
    serviceRequests: serviceRequests.map((request) => ({
      id: request.id.toString(), branchName: request.branch.name, tableNumber: request.table.number,
      type: request.type, status: request.status, priority: request.priority,
      createdAt: request.createdAt.toISOString(), claimedAt: request.claimedAt?.toISOString() ?? null,
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
      claimedByName: request.claimedBy?.name ?? null, resolvedByName: request.resolvedBy?.name ?? null,
    })),
  }
}
