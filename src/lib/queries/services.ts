import { createClient } from '@/lib/supabase/server'
import type { Service, ServiceOption } from '@/types'

/**
 * Get all active services for payment form selection
 * Sorted by nombre for consistent display
 */
export async function getActiveServices(): Promise<ServiceOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('services')
    .select('id, nombre, precio_base, precio_variable, precio_minimo, precio_maximo')
    .eq('activo', true)
    .order('nombre')

  if (error) {
    console.error('Error fetching services:', error)
    return []
  }

  return data || []
}

/**
 * Get all services (including inactive) for admin management
 */
export async function getAllServices(): Promise<Service[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('services')
    .select('*')
    .order('activo', { ascending: false })
    .order('nombre')

  if (error) {
    console.error('Error fetching all services:', error)
    return []
  }

  return data || []
}

/**
 * Get single service by ID
 */
export async function getServiceById(id: string): Promise<Service | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching service:', error)
    return null
  }

  return data
}
