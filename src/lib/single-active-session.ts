/**
 * Single-active-session management for the staff app.
 *
 * Records the most recently registered application session per staff member.
 * Supabase session revocation is deliberately not simulated here: ending an
 * Auth session requires the established Supabase administrative mechanism.
 */

import { prisma } from '@/lib/prisma';

/**
 * Register the current device for audit and stale-session checks. This is not
 * an Auth-token revocation mechanism.
 */
export async function manageSingleActiveSession(
  userId: string,
  deviceInfo: string | null,
  ipAddress: string | null,
): Promise<void> {
  // One durable row per identity is intentional (the database has a unique
  // constraint on user_id). Upsert makes concurrent repeat logins retry-safe
  // instead of attempting a second insert that violates that constraint.
  await prisma.userSession.upsert({
    where: { userId },
    create: { userId, deviceInfo, ipAddress, isActive: true },
    update: { deviceInfo, ipAddress, isActive: true, lastActivityAt: new Date() },
  })
}

/**
 * Extract a coarse device fingerprint from the User-Agent header.
 * Nothing client-controlled: it is a label for the session record, not a
 * security boundary.
 */
export function deviceFingerprint(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const lowered = userAgent.toLowerCase();
  if (lowered.includes('linux')) return 'Linux';
  if (lowered.includes('mac os')) return 'macOS';
  if (lowered.includes('windows')) return 'Windows';
  if (lowered.includes('iphone') || lowered.includes('ipad')) return 'iOS';
  if (lowered.includes('android')) return 'Android';
  return 'Unknown';
}

/**
 * Resolve the client IP used for auditability. Prefer X-Forwarded-For when the
 * request passes through a reverse proxy; fall back to `connection.remoteAddress`.
 */
export function clientIp(reqIp: string | undefined, forwardedFor: string | string[] | undefined): string | null {
  if (forwardedFor) {
    const first = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const ip = first.split(',')[0]?.trim();
    if (ip) return ip;
  }
  if (reqIp) return reqIp;
  return null;
}

/**
 * Generate a unique session record id. We align with `cuid()` used elsewhere in
 * the app (not `uuid()`; the Prisma model uses `cuid()` as its @id).
 */
export function makeSessionRecordId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 22);
}

/** Check whether the user already has an ACTIVE session record.
 *  Is safe for offline testing without a live Supabase DB (returns false). */
export async function hasActiveSession(userId: string): Promise<boolean> {
  try {
    const record = await prisma.userSession.findUnique({
      where: { userId },
    });
    return Boolean(record && record.isActive);
  } catch {
    return false;
  }
}

/** Ensure exactly one active session exists for the user (used in tests). */
export async function assertSingleActiveSession(userId: string): Promise<void> {
  const records = await prisma.userSession.findMany({
    where: { userId, isActive: true },
    orderBy: { lastActivityAt: 'desc' },
  });
  if (records.length > 1) {
    const first = records[0];
    await prisma.userSession.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
  }
}
