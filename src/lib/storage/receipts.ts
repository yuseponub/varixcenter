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
