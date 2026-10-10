import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Build the client, with a readable error if it cannot be created.
 *
 * `serverExternalPackages` keeps `@prisma/client` out of the bundle, so Node
 * `require`s it at runtime and it must have been generated on the host
 * (`prisma generate`, which `postinstall` runs). If it was not — or the query
 * engine cannot start on that platform — constructing the client throws. We
 * surface a clear, secret-free message rather than an opaque crash.
 */
function createClient(): PrismaClient {
  try {
    return new PrismaClient()
  } catch (err) {
    const detail = (err as Error).message || String(err)
    throw new Error(
      `Prisma client could not be created on this server. ` +
        `Usually this means "prisma generate" did not run in the deployed ` +
        `environment, or the query engine cannot start on this platform. ` +
        `Original: ${detail}`,
    )
  }
}

/**
 * Lazily create the client on FIRST USE — never at import time.
 *
 * The previous `export const prisma = new PrismaClient()` ran during module
 * evaluation, which happens while Next.js builds the server-component module
 * graph — BEFORE any React error boundary or our `getStaffSession()` try/catch
 * could run. A construction failure therefore escaped every handler and died as
 * a bare 500 with an opaque digest. Deferring construction moves any failure
 * onto a normal call stack where our boundary can render a readable message.
 *
 * The Proxy keeps every existing `prisma.user.find…` / `prisma.$transaction`
 * call site working unchanged while deferring the underlying construction.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient()
  }
  return globalForPrisma.prisma
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma() as unknown as Record<string | symbol, unknown>
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

/**
 * Safe, secret-free diagnosis of the DATABASE_URL environment variable.
 *
 * Prisma validates the datasource URL only at first query, so a misconfigured
 * host surfaces as a low-level "must start with postgresql://" error with no hint
 * of WHAT the value actually is. This reports only non-sensitive metadata —
 * presence, length bucket, and the scheme (text before `://`) — never the value,
 * host, credentials, or path. It lets an operator distinguish "unset" from
 * "still mysql://" from "present but malformed" at a glance.
 */
export function describeDbEnv(): string {
  const raw = process.env.DATABASE_URL

  if (raw === undefined || raw.trim() === '') {
    return 'DATABASE_URL: NOT SET (empty or missing on this server)'
  }

  const value = raw.trim().replace(/^["']|["']$/g, '') // tolerate stray quotes
  const scheme = value.includes('://') ? value.slice(0, value.indexOf('://')) : '(no "://")'

  // Length in coarse buckets — enough to spot a truncated paste, not a leak.
  const len = value.length
  const bucket = len < 20 ? 'very short' : len < 60 ? 'short' : len < 200 ? 'normal' : 'long'

  const verdict =
    scheme === 'postgresql' || scheme === 'postgres'
      ? 'looks valid (postgres scheme)'
      : `INVALID — expected scheme "postgresql", got "${scheme}"`

  return `DATABASE_URL: set, scheme="${scheme}", length≈${bucket}. ${verdict}`
}

