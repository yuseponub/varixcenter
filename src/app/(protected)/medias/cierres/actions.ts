'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  mediasCierreSchema,
  reopenMediasCierreSchema,
} from '@/lib/validations/medias/cierre'
import type {
  CreateMediasCierreResult,
  ReopenMediasCierreResult,
} from '@/types/medias/cierres'

// Note: medias_cierres RPC types not yet in generated types
// Using type assertions until migrations are applied and types regenerated

/**
 * Action state type for form handling
 */
export interface MediasCierreActionState {
  success: boolean
  error?: string
  errors?: Record<string, string[]>
  data?: CreateMediasCierreResult | ReopenMediasCierreResult
}

/**
 * Create a medias cash closing
 * Calls create_medias_cierre RPC
 *
 * CIE-04: Zero tolerance enforced by RPC
 * CIE-06: Sequential numbering (CIM-) handled by RPC
 */
export async function createMediasCierre(
  _prevState: MediasCierreActionState | null,
  formData: FormData
): Promise<MediasCierreActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      success: false,
      error: 'No autorizado. Por favor inicie sesion.',
    }
  }

  // Parse form data
  const rawData = {
    fecha: formData.get('fecha') as string,
    conteo_fisico: parseFloat(formData.get('conteo_fisico') as string) || 0,
    diferencia_justificacion: (formData.get('diferencia_justificacion') as string) || null,
    cierre_photo_path: formData.get('cierre_photo_path') as string,
    notas: (formData.get('notas') as string) || null,
  }

  // Validate with Zod
  const validated = mediasCierreSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      success: false,
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'Por favor corrija los errores en el formulario',
    }
  }

  // Call create RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('create_medias_cierre', {
    p_fecha: validated.data.fecha,
    p_conteo_fisico: validated.data.conteo_fisico,
    p_diferencia_justificacion: validated.data.diferencia_justificacion || '',
    p_cierre_photo_path: validated.data.cierre_photo_path,
    p_notas: validated.data.notas || null,
  })

  if (error) {
    console.error('Error creating medias cierre:', error)

    // Map database errors to user-friendly Spanish messages
    if (error.message.includes('Solo Secretaria y Admin')) {
      return {
        success: false,
        error: 'Solo Secretaria y Admin pueden cerrar caja',
      }
    }
    if (error.message.includes('dia futuro')) {
      return {
        success: false,
        error: 'No se puede cerrar un dia futuro',
      }
    }
    if (error.message.includes('Ya existe un cierre')) {
      return {
        success: false,
        error: 'Ya existe un cierre de medias para esta fecha',
      }
    }
    if (error.message.includes('foto del reporte')) {
      return {
        success: false,
        error: 'La foto del reporte firmado es obligatoria',
      }
    }
    if (error.message.includes('diferencia')) {
      return {
        success: false,
        error: error.message,
      }
    }
    if (error.message.includes('conteo fisico')) {
      return {
        success: false,
        error: 'El conteo fisico no puede ser negativo',
      }
    }

    return {
      success: false,
      error: error.message || 'Error al crear el cierre de medias',
    }
  }

  // Revalidate medias paths
  revalidatePath('/medias/cierres')
  revalidatePath('/medias/ventas')

  return {
    success: true,
    data: data as CreateMediasCierreResult,
  }
}

/**
 * Reopen a medias cash closing
 * Calls reopen_medias_cierre RPC
 *
 * CIE-07: Admin only, requires justification (enforced by RPC)
 */
export async function reopenMediasCierre(
  _prevState: MediasCierreActionState | null,
  formData: FormData
): Promise<MediasCierreActionState> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      success: false,
      error: 'No autorizado. Por favor inicie sesion.',
    }
  }

  // Parse form data
  const rawData = {
    cierre_id: formData.get('cierre_id') as string,
    justificacion: formData.get('justificacion') as string,
  }

  // Validate with Zod
  const validated = reopenMediasCierreSchema.safeParse(rawData)
  if (!validated.success) {
    return {
      success: false,
      errors: validated.error.flatten().fieldErrors as Record<string, string[]>,
      error: 'La justificacion debe tener al menos 10 caracteres',
    }
  }

  // Call reopen RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('reopen_medias_cierre', {
    p_cierre_id: validated.data.cierre_id,
    p_justificacion: validated.data.justificacion,
  })

  if (error) {
    console.error('Error reopening medias cierre:', error)

    // Map database errors to user-friendly Spanish messages
    if (error.message.includes('Solo Admin')) {
      return {
        success: false,
        error: 'Solo Admin puede reabrir cierres de caja',
      }
    }
    if (error.message.includes('10 caracteres')) {
      return {
        success: false,
        error: 'La justificacion debe tener al menos 10 caracteres',
      }
    }
    if (error.message.includes('no encontrado')) {
      return {
        success: false,
        error: 'Cierre no encontrado',
      }
    }
    if (error.message.includes('ya esta reabierto')) {
      return {
        success: false,
        error: 'El cierre ya esta reabierto',
      }
    }

    return {
      success: false,
      error: error.message || 'Error al reabrir el cierre de medias',
    }
  }

  // Revalidate medias paths
  revalidatePath('/medias/cierres')
  revalidatePath('/medias/ventas')

  return {
    success: true,
    data: data as ReopenMediasCierreResult,
  }
}
