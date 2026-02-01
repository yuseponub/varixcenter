'use server'

import { createClient } from '@/lib/supabase/server'

const BUCKET_NAME = 'payment-receipts'

/**
 * Generate a signed upload URL for payment receipt
 * Client uploads directly to Supabase Storage
 * Valid for 2 hours
 */
export async function createReceiptUploadUrl(
  fileName: string
): Promise<{ signedUrl: string; path: string } | { error: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Generate unique path: comprobantes/{user_id}/{timestamp}_{filename}
  const timestamp = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `comprobantes/${user.id}/${timestamp}_${safeName}`

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(path)

  if (error) {
    console.error('Failed to create signed URL:', error)
    return { error: 'Error al generar URL de subida' }
  }

  return {
    signedUrl: data.signedUrl,
    path: path
  }
}

/**
 * Generate a signed upload URL for cash closing photo
 * Uses the same bucket with subfolder cierres/
 * Valid for 2 hours
 */
export async function createCierreUploadUrl(
  fileName: string,
  fecha: string
): Promise<{ signedUrl: string; path: string } | { error: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Generate unique path: cierres/{user_id}/{fecha}_{timestamp}_{filename}
  const timestamp = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `cierres/${user.id}/${fecha}_${timestamp}_${safeName}`

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(path)

  if (error) {
    console.error('Failed to create signed URL for cierre:', error)
    return { error: 'Error al generar URL de subida' }
  }

  return {
    signedUrl: data.signedUrl,
    path: path
  }
}

/**
 * Get public URL for a receipt (for viewing)
 */
export async function getReceiptPublicUrl(path: string): Promise<string | null> {
  const supabase = await createClient()

  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path)

  return data.publicUrl
}

/**
 * Generate a signed upload URL for voice dictation audio
 * Stores in audios/{medical_record_id}/{timestamp}.webm
 * Valid for 2 hours
 */
export async function createAudioUploadUrl(
  medicalRecordId: string
): Promise<{ signedUrl: string; path: string } | { error: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Generate unique path: audios/{medical_record_id}/{timestamp}.webm
  const timestamp = Date.now()
  const path = `audios/${medicalRecordId}/${timestamp}.webm`

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(path)

  if (error) {
    console.error('Failed to create signed URL for audio:', error)
    return { error: 'Error al generar URL de subida de audio' }
  }

  return {
    signedUrl: data.signedUrl,
    path: path
  }
}

/**
 * Get signed URL for audio playback (valid for 1 hour)
 */
export async function getAudioSignedUrl(path: string): Promise<string | null> {
  const supabase = await createClient()

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, 3600) // 1 hour

  if (error) {
    console.error('Failed to get audio signed URL:', error)
    return null
  }

  return data.signedUrl
}

/**
 * Generate a signed upload URL for purchase invoice
 * Stores in facturas/{user_id}/{timestamp}_{filename}
 * Valid for 2 hours
 */
export async function createInvoiceUploadUrl(
  fileName: string
): Promise<{ signedUrl: string; path: string } | { error: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Generate unique path: facturas/{user_id}/{timestamp}_{filename}
  const timestamp = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `facturas/${user.id}/${timestamp}_${safeName}`

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(path)

  if (error) {
    console.error('Failed to create signed URL for invoice:', error)
    return { error: 'Error al generar URL de subida' }
  }

  return {
    signedUrl: data.signedUrl,
    path: path
  }
}

/**
 * Generate a signed upload URL for legacy history photo
 * Path: historias_antiguas/{medical_record_id}/{tipo}_{timestamp}.jpg
 * Valid for 2 hours
 */
export async function createLegacyPhotoUploadUrl(
  medicalRecordId: string,
  tipo: 'historia' | 'evolucion' | 'plan_tratamiento'
): Promise<{ signedUrl: string; path: string } | { error: string }> {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Verify user has clinical role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleData || !['admin', 'medico', 'enfermera'].includes(roleData.role)) {
    return { error: 'No autorizado para subir fotos de historias' }
  }

  // Generate unique path: historias_antiguas/{medical_record_id}/{tipo}_{timestamp}.jpg
  const timestamp = Date.now()
  const path = `historias_antiguas/${medicalRecordId}/${tipo}_${timestamp}.jpg`

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(path)

  if (error) {
    console.error('Failed to create signed URL for legacy photo:', error)
    return { error: 'Error al generar URL de subida' }
  }

  return {
    signedUrl: data.signedUrl,
    path: path
  }
}

/**
 * Get signed URL for legacy photo viewing (valid for 1 hour)
 */
export async function getLegacyPhotoSignedUrl(path: string): Promise<string | null> {
  const supabase = await createClient()

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, 3600) // 1 hour

  if (error) {
    console.error('Failed to get legacy photo signed URL:', error)
    return null
  }

  return data.signedUrl
}
