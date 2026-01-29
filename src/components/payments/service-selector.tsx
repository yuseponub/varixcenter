'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Trash2, Plus } from 'lucide-react'
import type { ServiceOption } from '@/types/services'
import type { PaymentItemInput } from '@/types/payments'

interface ServiceSelectorProps {
  services: ServiceOption[]
  items: PaymentItemInput[]
  onChange: (items: PaymentItemInput[]) => void
  disabled?: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

export function ServiceSelector({
  services,
  items,
  onChange,
  disabled
}: ServiceSelectorProps) {
  const [selectedServiceId, setSelectedServiceId] = useState<string>('')

  const handleAddService = useCallback(() => {
    if (!selectedServiceId) return

    const service = services.find(s => s.id === selectedServiceId)
    if (!service) return

    // Check if already added
    if (items.some(item => item.service_id === service.id)) {
      // Increment quantity instead
      onChange(items.map(item =>
        item.service_id === service.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      // Add new item
      onChange([...items, {
        service_id: service.id,
        service_name: service.nombre,
        unit_price: service.precio_base,
        quantity: 1
      }])
    }

    setSelectedServiceId('')
  }, [selectedServiceId, services, items, onChange])

  const handleRemoveItem = useCallback((serviceId: string) => {
    onChange(items.filter(item => item.service_id !== serviceId))
  }, [items, onChange])

  const handleQuantityChange = useCallback((serviceId: string, quantity: number) => {
    if (quantity < 1) return
    onChange(items.map(item =>
      item.service_id === serviceId
        ? { ...item, quantity }
        : item
    ))
  }, [items, onChange])

  const handlePriceChange = useCallback((serviceId: string, price: number) => {
    const service = services.find(s => s.id === serviceId)
    if (!service?.precio_variable) return

    // Allow free typing - validation happens on blur
    onChange(items.map(item =>
      item.service_id === serviceId
        ? { ...item, unit_price: price }
        : item
    ))
  }, [services, items, onChange])

  const handlePriceBlur = useCallback((serviceId: string) => {
    const service = services.find(s => s.id === serviceId)
    const item = items.find(i => i.service_id === serviceId)
    if (!service?.precio_variable || !item) return

    // Clamp to min/max range only on blur
    const clampedPrice = Math.min(
      Math.max(item.unit_price, service.precio_minimo || 0),
      service.precio_maximo || Infinity
    )

    if (clampedPrice !== item.unit_price) {
      onChange(items.map(i =>
        i.service_id === serviceId
          ? { ...i, unit_price: clampedPrice }
          : i
      ))
    }
  }, [services, items, onChange])

  const getService = (serviceId: string) => services.find(s => s.id === serviceId)

  return (
    <div className="space-y-4">
      <Label>Servicios</Label>

      {/* Service selector */}
      <div className="flex gap-2">
        <Select
          value={selectedServiceId}
          onValueChange={setSelectedServiceId}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Seleccionar servicio..." />
          </SelectTrigger>
          <SelectContent>
            {services.map(service => (
              <SelectItem key={service.id} value={service.id}>
                {service.nombre} - {formatCurrency(service.precio_base)}
                {service.precio_variable && ' (variable)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={handleAddService}
          disabled={disabled || !selectedServiceId}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Selected items */}
      <div className="space-y-2">
        {items.map(item => {
          const service = getService(item.service_id)
          const isVariable = service?.precio_variable

          return (
            <Card key={item.service_id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.service_name}</p>
                    {isVariable && service && (
                      <p className="text-xs text-muted-foreground">
                        Rango: {formatCurrency(service.precio_minimo || 0)} - {formatCurrency(service.precio_maximo || 0)}
                      </p>
                    )}
                  </div>

                  {/* Price input (editable for variable) */}
                  <div className="w-32">
                    <Input
                      type="number"
                      value={item.unit_price}
                      onChange={e => handlePriceChange(item.service_id, parseFloat(e.target.value) || 0)}
                      onBlur={() => handlePriceBlur(item.service_id)}
                      disabled={disabled || !isVariable}
                      className="text-right"
                      min={service?.precio_minimo || 0}
                      max={service?.precio_maximo || undefined}
                      step="any"
                    />
                  </div>

                  {/* Quantity input */}
                  <div className="w-20">
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={e => handleQuantityChange(item.service_id, parseInt(e.target.value) || 1)}
                      disabled={disabled}
                      min={1}
                      className="text-center"
                    />
                  </div>

                  {/* Subtotal */}
                  <div className="w-28 text-right text-sm font-medium">
                    {formatCurrency(item.unit_price * item.quantity)}
                  </div>

                  {/* Remove button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(item.service_id)}
                    disabled={disabled}
                    className="h-8 w-8 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Seleccione al menos un servicio
        </p>
      )}
    </div>
  )
}
