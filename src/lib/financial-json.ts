import { NextResponse } from 'next/server'

/** Convert database identifiers at the HTTP boundary without mutating Prisma objects. */
export function financialJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(JSON.parse(JSON.stringify(body, (_key, value) => typeof value === 'bigint' ? value.toString() : value)), init)
}
