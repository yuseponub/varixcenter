'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import type { PendingServicesGroup } from '@/types/appointment-services'
import type { PaymentItemWithAppointmentService } from '@/types/appointment-services'

interface PendingServicesSelectorProps {
  groups: PendingServicesGroup[]
  selectedItems: PaymentItemWithAppointmentService[]
  onChange: (items: PaymentItemWithAppointmentService[]) => void
  disabled?: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))

/**
 * Component to select pending appointment services for payment.
 *
 * Features:
 * - Groups services by appointment date
 * - Checkbox selection for each service
 * - Shows service details (name, quantity, price)
 * - Calculates selected total
 * - Converts selected services to payment items
 */
export function PendingServicesSelector({
  groups,
  selectedItems,
  onChange,
  disabled = false,
}: PendingServicesSelectorProps) {
  // Get IDs of currently selected services
  const selectedIds = new Set(
    selectedItems
      .filter((item) => item.appointment_service_id)
      .map((item) => item.appointment_service_id)
  )

  // Handle selecting/deselecting a service
  const handleServiceToggle = useCallback(
    (service: PendingServicesGroup['services'][0], checked: boolean) => {
      if (checked) {
        // Add service to selection
        const newItem: PaymentItemWithAppointmentService = {
          service_id: service.service_id,
          service_name: service.service_name,
          unit_price: service.precio_unitario,
          quantity: service.cantidad,
          appointment_service_id: service.id,
        }
        onChange([...selectedItems, newItem])
      } else {
        // Remove service from selection
        onChange(
          selectedItems.filter(
            (item) => item.appointment_service_id !== service.id
          )
        )
      }
    },
    [selectedItems, onChange]
  )

  // Handle selecting/deselecting all services in a group
  const handleGroupToggle = useCallback(
    (group: PendingServicesGroup, checked: boolean) => {
      if (checked) {
        // Add all services from this group that aren't already selected
        const newItems: PaymentItemWithAppointmentService[] = group.services
          .filter((s) => !selectedIds.has(s.id))
          .map((s) => ({
            service_id: s.service_id,
            service_name: s.service_name,
            unit_price: s.precio_unitario,
            quantity: s.cantidad,
            appointment_service_id: s.id,
          }))
        onChange([...selectedItems, ...newItems])
      } else {
        // Remove all services from this group
        const groupServiceIds = new Set(group.services.map((s) => s.id))
        onChange(
          selectedItems.filter(
            (item) =>
              !item.appointment_service_id ||
              !groupServiceIds.has(item.appointment_service_id)
          )
        )
      }
    },
    [selectedItems, selectedIds, onChange]
  )

  // Check if all services in a group are selected
  const isGroupFullySelected = (group: PendingServicesGroup) =>
    group.services.every((s) => selectedIds.has(s.id))

  // Check if some services in a group are selected
  const isGroupPartiallySelected = (group: PendingServicesGroup) =>
    group.services.some((s) => selectedIds.has(s.id)) &&
    !isGroupFullySelected(group)

  // Calculate selected total
  const selectedTotal = selectedItems
    .filter((item) => item.appointment_service_id)
    .reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  if (groups.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Servicios Pendientes de Citas</span>
          {selectedIds.size > 0 && (
            <Badge variant="secondary">
              {selectedIds.size} seleccionado(s): {formatCurrency(selectedTotal)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => (
          <div key={group.appointment_id} className="border rounded-lg p-3">
            {/* Group header with date and select all checkbox */}
            <div className="flex items-center gap-3 mb-3">
              <Checkbox
                id={`group-${group.appointment_id}`}
                checked={isGroupFullySelected(group)}
                // Using indeterminate styling via data attribute
                data-indeterminate={isGroupPartiallySelected(group)}
                onCheckedChange={(checked) =>
                  handleGroupToggle(group, checked === true)
                }
                disabled={disabled}
                className="data-[indeterminate=true]:bg-primary/50"
              />
              <Label
                htmlFor={`group-${group.appointment_id}`}
                className="font-medium cursor-pointer"
              >
                Cita del {formatDate(group.appointment_date)}
              </Label>
              <Badge variant="outline" className="ml-auto">
                Total: {formatCurrency(group.total)}
              </Badge>
            </div>

            {/* Individual services */}
            <div className="space-y-2 ml-6">
              {group.services.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center gap-3 py-1.5 hover:bg-muted/50 rounded px-2 -mx-2"
                >
                  <Checkbox
                    id={`service-${service.id}`}
                    checked={selectedIds.has(service.id)}
                    onCheckedChange={(checked) =>
                      handleServiceToggle(service, checked === true)
                    }
                    disabled={disabled}
                  />
                  <Label
                    htmlFor={`service-${service.id}`}
                    className="flex-1 cursor-pointer"
                  >
                    <span className="font-medium">{service.service_name}</span>
                    {service.cantidad > 1 && (
                      <span className="text-muted-foreground ml-2">
                        x{service.cantidad}
                      </span>
                    )}
                    {service.notas && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {service.notas}
                      </p>
                    )}
                  </Label>
                  <span className="text-sm font-medium">
                    {formatCurrency(service.subtotal)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          Seleccione los servicios de citas anteriores que desea incluir en este pago.
          Tambien puede agregar servicios adicionales del catalogo.
        </p>
      </CardContent>
    </Card>
  )
}
