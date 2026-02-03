'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface ActionResult {
  success: boolean
  error?: string
}

/**
 * Add procedimiento del día as a progress note
 * This creates a new progress note with the procedure being performed today
 */
export async function addProcedimientoDelDia(
  medicalRecordId: string,
  procedimiento: string
): Promise<ActionResult> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autorizado. Por favor inicie sesion.' }
  }

  if (!procedimiento || procedimiento.trim().length < 3) {
    return { success: false, error: 'El procedimiento es muy corto.' }
  }

  // Format the note with date and procedure
  const today = new Date().toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const notaTexto = `PROCEDIMIENTO DEL DIA (${today}):\n${procedimiento.trim()}`

  // Insert progress note
  const { error } = await supabase
    .from('progress_notes')
    .insert({
      medical_record_id: medicalRecordId,
      nota: notaTexto,
      created_by: user.id,
    })

  if (error) {
    console.error('Error adding procedimiento del dia:', error)
    return { success: false, error: 'Error al guardar el procedimiento.' }
  }

  // Revalidate affected pages
  revalidatePath(`/historias/${medicalRecordId}`)
  revalidatePath(`/historias/${medicalRecordId}/historia-antigua`)
  revalidatePath(`/historias/${medicalRecordId}/diagrama`)

  return { success: true }
}
