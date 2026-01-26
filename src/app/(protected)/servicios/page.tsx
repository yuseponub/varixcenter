'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Service } from '@/types/services'
import { ServicesTable } from '@/components/services/services-table'
import { ServiceForm } from '@/components/services/service-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * Service catalog admin page
 * Allows admin to manage services and their prices
 */
export default function ServiciosPage() {
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Fetch services on mount and after changes
  const fetchServices = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('nombre')

    if (error) {
      console.error('Error fetching services:', error)
    } else {
      setServices(data || [])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchServices()
  }, [])

  // Refetch when dialog closes after success
  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open)
    if (!open) {
      fetchServices()
    }
  }

  const handleSuccess = () => {
    setIsDialogOpen(false)
    fetchServices()
  }

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Catalogo de Servicios</h1>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button>Nuevo Servicio</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Servicio</DialogTitle>
            </DialogHeader>
            <ServiceForm onSuccess={handleSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Services Table */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        </div>
      ) : (
        <ServicesTable data={services} onRefresh={fetchServices} />
      )}
    </div>
  )
}
