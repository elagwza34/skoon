import { NextResponse } from 'next/server'

/** True only for authenticated staff JSON endpoints, never public guest APIs. */
export function isStaffApiPath(pathname: string) {
  return pathname === '/api/staff' || pathname.startsWith('/api/staff/')
}

/** Shared HTTP semantics for staff API guards. */
export function unauthenticatedStaffResponse() {
  return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
}

export function forbiddenStaffResponse() {
  return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
}
