'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { QuotationItem } from '@/types'

interface UpdateResult {
  success: boolean
  error?: string
}

/**
 * Update diagram and diagnosis for a medical record.
 * Also finalizes the quotation if treatments exist.
 */
export async function updateDiagramAndDiagnosis(
  medicalRecordId: string,
  diagramaPiernas: string | null,
  diagnostico: string | null
): Promise<UpdateResult> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Update medical record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('medical_records')
    .update({
      diagrama_piernas: diagramaPiernas,
      diagnostico: diagnostico,
      updated_by: user.id,
    })
    .eq('id', medicalRecordId)

  if (error) {
    console.error('Update diagram/diagnosis error:', error)

    // Map database errors
    if (error.message?.includes('Enfermera no puede modificar')) {
      return { success: false, error: error.message }
    }

    return { success: false, error: 'Error al guardar. Por favor intente de nuevo.' }
  }

  // Mark quotation as finalized (update timestamp to indicate it's been saved with diagnosis)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('quotations')
    .update({
      updated_by: user.id,
    })
    .eq('medical_record_id', medicalRecordId)

  // Revalidate affected pages
  revalidatePath(`/historias/${medicalRecordId}`)
  revalidatePath(`/historias/${medicalRecordId}/diagrama`)
  revalidatePath(`/historias/${medicalRecordId}/editar`)
  revalidatePath(`/historias/${medicalRecordId}/cotizacion`)

  return { success: true }
}

/**
 * Treatment item input from the selector
 */
export interface TreatmentItemInput {
  id: string
  service_id: string
  service_nombre: string
  cantidad: number
  nota: string
}

/**
 * Update treatments for a medical record and auto-update quotation
 */
export async function updateTreatments(
  medicalRecordId: string,
  treatmentItems: TreatmentItemInput[]
): Promise<UpdateResult> {
  const supabase = await createClient()

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autorizado. Por favor inicie sesion.' }
  }

  // Extract unique service IDs for the medical record
  const treatmentIds = [...new Set(treatmentItems.map(item => item.service_id))]

  // Update medical record with treatment IDs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('medical_records')
    .update({
      tratamiento_ids: treatmentIds,
      updated_by: user.id,
    })
    .eq('id', medicalRecordId)

  if (updateError) {
    console.error('Update treatments error:', updateError)

    if (updateError.message?.includes('Enfermera no puede modificar')) {
      return { success: false, error: updateError.message }
    }

    return { success: false, error: 'Error al guardar tratamientos. Por favor intente de nuevo.' }
  }

  // Auto-update quotation with detailed items
  if (treatmentItems.length > 0) {
    // Fetch service prices
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: services, error: servicesError } = await (supabase as any)
      .from('services')
      .select('id, nombre, precio_base')
      .in('id', treatmentIds)

    if (servicesError) {
      console.error('Error fetching services:', servicesError)
    } else if (services && services.length > 0) {
      // Create price map
      const priceMap = new Map<string, number>()
      services.forEach((s: { id: string; precio_base: number }) => {
        priceMap.set(s.id, s.precio_base)
      })

      // Create quotation items with quantity, notes, and subtotals
      const items: QuotationItem[] = treatmentItems.map(item => {
        const precio = priceMap.get(item.service_id) || 0
        const subtotal = precio * item.cantidad
        return {
          id: item.id,
          service_id: item.service_id,
          nombre: item.service_nombre,
          precio,
          cantidad: item.cantidad,
          nota: item.nota || undefined,
          subtotal,
        }
      })

      const total = items.reduce((sum, item) => sum + (item.subtotal || 0), 0)

      // Check if quotation exists
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingQuotation } = await (supabase as any)
        .from('quotations')
        .select('id')
        .eq('medical_record_id', medicalRecordId)
        .single()

      if (existingQuotation) {
        // Update existing quotation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('quotations')
          .update({
            items,
            total,
            updated_by: user.id,
          })
          .eq('id', existingQuotation.id)
      } else {
        // Create new quotation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('quotations')
          .insert({
            medical_record_id: medicalRecordId,
            items,
            total,
            created_by: user.id,
            updated_by: user.id,
          })
      }
    }
  } else {
    // If no treatments, delete quotation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('quotations')
      .delete()
      .eq('medical_record_id', medicalRecordId)
  }

  // Revalidate affected pages
  revalidatePath(`/historias/${medicalRecordId}`)
  revalidatePath(`/historias/${medicalRecordId}/diagrama`)
  revalidatePath(`/historias/${medicalRecordId}/cotizacion`)

  return { success: true }
}
