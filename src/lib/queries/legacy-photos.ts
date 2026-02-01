'use server'

import { createClient } from '@/lib/supabase/server'
import { getLegacyPhotoSignedUrl } from '@/lib/storage/receipts'
import type {
  LegacyHistoryPhoto,
  LegacyHistoryPhotoWithUrl,
  LegacyPhotoType,
  CreateLegacyPhotoInput,
} from '@/types'

/**
 * Get all legacy photos for a medical record
 */
export async function getLegacyPhotosByMedicalRecord(
  medicalRecordId: string
): Promise<LegacyHistoryPhotoWithUrl[]> {
  const supabase = await createClient()

  const { data, error } = await (supabase as any)
    .from('legacy_history_photos')
    .select('*')
    .eq('medical_record_id', medicalRecordId)
    .order('tipo')
    .order('orden')

  if (error) {
    console.error('Error fetching legacy photos:', error)
    return []
  }

  // Get signed URLs for each photo
  const photosWithUrls = await Promise.all(
    (data as LegacyHistoryPhoto[]).map(async (photo) => {
      const url = await getLegacyPhotoSignedUrl(photo.storage_path)
      return { ...photo, url }
    })
  )

  return photosWithUrls
}

/**
 * Get legacy photos by type for a medical record
 */
export async function getLegacyPhotosByType(
  medicalRecordId: string,
  tipo: LegacyPhotoType
): Promise<LegacyHistoryPhotoWithUrl[]> {
  const supabase = await createClient()

  const { data, error } = await (supabase as any)
    .from('legacy_history_photos')
    .select('*')
    .eq('medical_record_id', medicalRecordId)
    .eq('tipo', tipo)
    .order('orden')

  if (error) {
    console.error('Error fetching legacy photos by type:', error)
    return []
  }

  // Get signed URLs for each photo
  const photosWithUrls = await Promise.all(
    (data as LegacyHistoryPhoto[]).map(async (photo) => {
      const url = await getLegacyPhotoSignedUrl(photo.storage_path)
      return { ...photo, url }
    })
  )

  return photosWithUrls
}

/**
 * Check if a medical record has any legacy photos
 */
export async function hasLegacyPhotos(medicalRecordId: string): Promise<boolean> {
  const supabase = await createClient()

  const { count, error } = await (supabase as any)
    .from('legacy_history_photos')
    .select('id', { count: 'exact', head: true })
    .eq('medical_record_id', medicalRecordId)

  if (error) {
    console.error('Error checking legacy photos:', error)
    return false
  }

  return (count ?? 0) > 0
}

/**
 * Get count of legacy photos by type for a medical record
 */
export async function getLegacyPhotosCounts(
  medicalRecordId: string
): Promise<Record<LegacyPhotoType, number>> {
  const supabase = await createClient()

  const { data, error } = await (supabase as any)
    .from('legacy_history_photos')
    .select('tipo')
    .eq('medical_record_id', medicalRecordId)

  if (error) {
    console.error('Error fetching legacy photos counts:', error)
    return { historia: 0, evolucion: 0, plan_tratamiento: 0 }
  }

  const counts: Record<LegacyPhotoType, number> = {
    historia: 0,
    evolucion: 0,
    plan_tratamiento: 0,
  }

  for (const photo of data as { tipo: LegacyPhotoType }[]) {
    counts[photo.tipo]++
  }

  return counts
}

/**
 * Create a new legacy photo record
 */
export async function createLegacyPhoto(
  input: CreateLegacyPhotoInput
): Promise<LegacyHistoryPhoto | null> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('User not authenticated')
    return null
  }

  // Get next orden for this type
  const { data: existing } = await (supabase as any)
    .from('legacy_history_photos')
    .select('orden')
    .eq('medical_record_id', input.medical_record_id)
    .eq('tipo', input.tipo)
    .order('orden', { ascending: false })
    .limit(1)

  const nextOrden = existing && existing.length > 0
    ? (existing[0].orden as number) + 1
    : 0

  const { data, error } = await (supabase as any)
    .from('legacy_history_photos')
    .insert({
      medical_record_id: input.medical_record_id,
      tipo: input.tipo,
      storage_path: input.storage_path,
      orden: input.orden ?? nextOrden,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating legacy photo:', error)
    return null
  }

  return data as LegacyHistoryPhoto
}

/**
 * Delete a legacy photo
 */
export async function deleteLegacyPhoto(photoId: string): Promise<boolean> {
  const supabase = await createClient()

  // First get the photo to delete from storage
  const { data: photo, error: fetchError } = await (supabase as any)
    .from('legacy_history_photos')
    .select('storage_path')
    .eq('id', photoId)
    .single()

  if (fetchError) {
    console.error('Error fetching photo to delete:', fetchError)
    return false
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('payment-receipts')
    .remove([photo.storage_path])

  if (storageError) {
    console.error('Error deleting from storage:', storageError)
    // Continue to delete the DB record anyway
  }

  // Delete from database
  const { error } = await (supabase as any)
    .from('legacy_history_photos')
    .delete()
    .eq('id', photoId)

  if (error) {
    console.error('Error deleting legacy photo:', error)
    return false
  }

  return true
}
