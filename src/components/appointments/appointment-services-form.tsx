'use client'

import { useState, useCallback, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trash2, Plus, Loader2, CreditCard } from 'lucide-react'
import {
  addServiceToAppointment,
  removeServiceFromAppointment,
  getAppointmentServices,
} from '@/app/(protected)/citas/service-actions'
import type { ServiceOption } from '@/types/services'
import type { AppointmentService } from '@/types/appointment-services'
import { ESTADO_PAGO_LABELS } from '@/types/appointment-services'
import Link from 'next/link'

interface AppointmentServicesFormProps {
  appointmentId: string
  patientId: string
  services: ServiceOption[]
  initialServices?: AppointmentService[]
  disabled?: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

/**
 * Form for adding/removing services from an appointment.
 *
 * Features:
 * - Select from service catalog
 * - Adjust quantity and price (for variable services)
 * - Add optional notes
 * - View existing services with payment status
 * - Remove pending services
 * - Link to payment page
 */
export function AppointmentServicesForm({
  appointmentId,
  patientId,
  services,
  initialServices = [],
  disabled = false,
}: AppointmentServicesFormProps) {
  const [isPending, startTransition] = useTransition()
  const [appointmentServices, setAppointmentServices] =
    useState<AppointmentService[]>(initialServices)

  // Form state for adding new service
  const [selectedServiceId, setSelectedServiceId] = useState<string>('')
  const [cantidad, setCantidad] = useState(1)
  const [precioUnitario, setPrecioUnitario] = useState(0)
  const [notas, setNotas] = useState('')

  // Get selected service details
  const selectedService = services.find((s) => s.id === selectedServiceId)

  // Reset price when service changes
  useEffect(() => {
    if (selectedService) {
      setPrecioUnitario(selectedService.precio_base)
    }
  }, [selectedService])

  // Refresh services list
  const refreshServices = useCallback(async () => {
    const updated = await getAppointmentServices(appointmentId)
    setAppointmentServices(updated as AppointmentService[])
  }, [appointmentId])

  // Handle adding a service
  const handleAddService = useCallback(() => {
    if (!selectedServiceId || !selectedService) return

    startTransition(async () => {
      const result = await addServiceToAppointment(
        appointmentId,
        selectedServiceId,
        cantidad,
        precioUnitario,
        notas || undefined
      )

      if (result.success) {
        toast.success(`Servicio "${selectedService.nombre}" agregado`)
        // Reset form
        setSelectedServiceId('')
        setCantidad(1)
        setPrecioUnitario(0)
        setNotas('')
        // Refresh list
        await refreshServices()
      } else {
        toast.error(result.error || 'Error al agregar servicio')
      }
    })
  }, [
    appointmentId,
    selectedServiceId,
    selectedService,
    cantidad,
    precioUnitario,
    notas,
    refreshServices,
  ])

  // Handle removing a service
  const handleRemoveService = useCallback(
    (serviceId: string, serviceName: string) => {
      startTransition(async () => {
        const result = await removeServiceFromAppointment(serviceId)

        if (result.success) {
          toast.success(`Servicio "${serviceName}" eliminado`)
          await refreshServices()
        } else {
          toast.error(result.error || 'Error al eliminar servicio')
        }
      })
    },
    [refreshServices]
  )

  // Calculate totals
  const pendingTotal = appointmentServices
    .filter((s) => s.estado_pago === 'pendiente')
    .reduce((sum, s) => sum + s.subtotal, 0)

  const hasPendingServices = appointmentServices.some(
    (s) => s.estado_pago === 'pendiente'
  )

  return (
    <div className="space-y-4">
      {/* Add service form */}
      <div className="space-y-3">
        <Label>Agregar Servicio</Label>

        {/* Service selector */}
        <Select
          value={selectedServiceId}
          onValueChange={setSelectedServiceId}
          disabled={disabled || isPending}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar servicio..." />
          </SelectTrigger>
          <SelectContent>
            {services.map((service) => (
              <SelectItem key={service.id} value={service.id}>
                {service.nombre} - {formatCurrency(service.precio_base)}
                {service.precio_variable && ' (variable)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Quantity and price inputs (shown when service selected) */}
        {selectedService && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cantidad" className="text-xs">
                Cantidad
              </Label>
              <Input
                id="cantidad"
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(parseInt(e.target.value) || 1)}
                disabled={disabled || isPending}
                min={1}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="precio" className="text-xs">
                Precio Unitario
              </Label>
              <Input
                id="precio"
                type="number"
                value={precioUnitario}
                onChange={(e) =>
                  setPrecioUnitario(parseFloat(e.target.value) || 0)
                }
                disabled={disabled || isPending || !selectedService.precio_variable}
                min={selectedService.precio_minimo || 0}
                max={selectedService.precio_maximo || undefined}
              />
              {selectedService.precio_variable && (
                <p className="text-xs text-muted-foreground">
                  Rango: {formatCurrency(selectedService.precio_minimo || 0)} -{' '}
                  {formatCurrency(selectedService.precio_maximo || 0)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Notes input */}
        {selectedService && (
          <div className="space-y-1">
            <Label htmlFor="notas" className="text-xs">
              Notas (opcional)
            </Label>
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={disabled || isPending}
              placeholder="Detalles adicionales del servicio..."
              rows={2}
            />
          </div>
        )}

        {/* Subtotal preview and add button */}
        {selectedService && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Subtotal: {formatCurrency(precioUnitario * cantidad)}
            </span>
            <Button
              type="button"
              onClick={handleAddService}
              disabled={disabled || isPending || !selectedServiceId}
              size="sm"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Agregar
            </Button>
          </div>
        )}
      </div>

      {/* Divider */}
      {appointmentServices.length > 0 && <hr className="my-4" />}

      {/* List of services */}
      {appointmentServices.length > 0 && (
        <div className="space-y-2">
          <Label>Servicios Registrados</Label>
          {appointmentServices.map((service) => (
            <Card key={service.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{service.service_name}</p>
                      <Badge
                        variant={
                          service.estado_pago === 'pagado'
                            ? 'default'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {ESTADO_PAGO_LABELS[service.estado_pago]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(service.precio_unitario)} x {service.cantidad}
                    </p>
                    {service.notas && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {service.notas}
                      </p>
                    )}
                  </div>

                  {/* Subtotal */}
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {formatCurrency(service.subtotal)}
                    </p>
                  </div>

                  {/* Remove button (only for pending) */}
                  {service.estado_pago === 'pendiente' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        handleRemoveService(service.id, service.service_name)
                      }
                      disabled={disabled || isPending}
                      className="h-8 w-8 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary and payment link */}
      {hasPendingServices && (
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                Total Pendiente: {formatCurrency(pendingTotal)}
              </p>
              <p className="text-xs text-muted-foreground">
                {appointmentServices.filter((s) => s.estado_pago === 'pendiente').length}{' '}
                servicio(s) sin pagar
              </p>
            </div>
            <Button asChild variant="default" size="sm">
              <Link href={`/pagos/nuevo?patient=${patientId}`}>
                <CreditCard className="mr-2 h-4 w-4" />
                Ir a Cobrar
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {appointmentServices.length === 0 && !selectedService && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay servicios registrados para esta cita
        </p>
      )}
    </div>
  )
}
