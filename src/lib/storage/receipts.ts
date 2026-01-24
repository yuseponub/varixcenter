'use server'

import { createClient } from '@/lib/supabase/server'

const BUCKET_NAME = 'payment-receipts'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

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
 * Validate file before upload
 * Returns error message or null if valid
 */
export function validateReceiptFile(file: { size: number; type: string }): string | null {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

  if (!allowedTypes.includes(file.type)) {
    return 'Solo se permiten imagenes (JPEG, PNG, WebP, HEIC)'
  }

  if (file.size > MAX_FILE_SIZE) {
    return 'La imagen no puede superar 5MB'
  }

  return null
}
