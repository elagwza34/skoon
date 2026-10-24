import { ROLE } from '@/lib/authz'

export type ServiceRequestMonitorGroup = 'pending' | 'claimed' | 'completed'

/** The monitor groups persisted service-request states without changing them. */
export function serviceRequestMonitorGroup(status: string): ServiceRequestMonitorGroup {
  if (status === 'pending') return 'pending'
  if (status === 'accepted' || status === 'in_progress') return 'claimed'
  return 'completed'
}

/** Owners may observe the queue, but only its operational roles may write it. */
export function canMutateServiceRequest(role: string): boolean {
  return role === ROLE.WAITER || role === ROLE.MANAGER
}
