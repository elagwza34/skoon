import { prisma } from '@/lib/prisma'
import { ROLE, type RoleSlug } from '@/lib/authz'

/**
 * Notifications — server-only fan-out of order-lifecycle events to the staff who
 * must act next.
 *
 * MODEL: a Notification row is addressed to ONE user (`userId`). To notify a
 * whole ROLE (e.g. "all waiters of this branch") we resolve the active users of
 * that role in the branch and create one row per user. Branch scoping means a
 * waiter in branch A never sees a bell for an order in branch B; the Owner
 * (`branchId = null`) is treated as cross-branch and is notified regardless.
 *
 * ATOMICITY: every writer below takes a Prisma transaction client (`tx`) so the
 * notification is created in the SAME transaction as the state change it
 * describes. If the order update rolls back, its bell rolls back too — a bell
 * can never point at a status the order is not actually in.
 *
 * `type` is a stable slug (order.<event>) so the UI can map it to an icon/tone
 * and so tests can assert on it without depending on Arabic copy.
 */

/** Transaction client shape we depend on (satisfied by both `prisma` and `tx`). */
type NotifClient = Pick<typeof prisma, 'user' | 'notification'>

export type NotificationType =
  | 'order.created'
  | 'order.sent_to_kitchen'
  | 'order.preparing'
  | 'order.ready'
  | 'order.served'
  | 'order.awaiting_payment'
  | 'order.paid'
  | 'order.cancelled'
  | 'hr.schedule.published'
  | 'hr.attendance.correction_decided'

interface NotifyInput {
  type: NotificationType
  title: string
  body?: string | null
  orderId?: bigint | null
}

/**
 * Create one notification per active user of `roleSlug` in `branchId`.
 * Owner recipients are matched cross-branch (their branchId is null).
 * Returns the number of rows created (0 = no such user was active/on shift).
 */
export async function notifyRole(
  client: NotifClient,
  roleSlug: RoleSlug,
  branchId: bigint,
  input: NotifyInput,
): Promise<number> {
  const recipients = await client.user.findMany({
    where: {
      role: { slug: roleSlug },
      isActive: true,
      deletedAt: null,
      OR: [{ branchId }, { role: { slug: ROLE.OWNER } }],
    },
    select: { id: true },
  })
  if (recipients.length === 0) return 0

  const result = await client.notification.createMany({
    data: recipients.map((u) => ({
      userId: u.id,
      orderId: input.orderId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
    })),
  })
  return result.count
}

/** Notify a single user by id (e.g. the specific cashier who will collect). */
export async function notifyUser(
  client: NotifClient,
  userId: string,
  input: NotifyInput,
): Promise<void> {
  await client.notification.create({
    data: {
      userId,
      orderId: input.orderId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
    },
  })
}

/** Serializable notification row for the bell UI. */
export interface StaffNotification {
  id: string
  type: string
  title: string
  body: string | null
  isRead: boolean
  createdAt: string
  orderId: string | null
}

/** Latest notifications for a user, newest first, capped. */
export async function listNotifications(
  userId: string,
  limit = 20,
): Promise<StaffNotification[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, type: true, title: true, body: true, isRead: true, createdAt: true, orderId: true },
  })
  return rows.map((n) => ({
    id: n.id.toString(),
    type: n.type,
    title: n.title,
    body: n.body,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
    orderId: n.orderId?.toString() ?? null,
  }))
}

/** Count of unread notifications (drives the bell badge). */
export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } })
}

/** Mark every unread notification for a user as read. Returns rows updated. */
export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })
  return result.count
}
