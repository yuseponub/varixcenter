'use server'

import { getPendingServicesGrouped } from '@/lib/queries/appointment-services'
import type { PendingServicesGroup } from '@/types/appointment-services'

/**
 * Server action to get pending services grouped by appointment
 *
 * Used by PaymentForm to fetch pending services when patient is selected.
 */
export async function getPendingServicesGroupedAction(
  patientId: string
): Promise<PendingServicesGroup[]> {
  if (!patientId) {
    return []
  }

  return getPendingServicesGrouped(patientId)
}
