'use client'

/**
 * Treatment Selector Component
 *
 * Allows doctors to select treatments with quantity and notes.
 * Each treatment can have multiple sessions with specific notes (e.g., per leg).
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { Loader2, Briefcase, Plus, Trash2, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TreatmentItem {
  id: string // unique id for this line item
  service_id: string
  service_nombre: string
  cantidad: number
  nota: string
}

interface Service {
  id: string
  nombre: string
}

interface TreatmentSelectorProps {
  /** Currently selected treatments */
  items: TreatmentItem[]
  /** Available services/treatments */
  services: Service[]
  /** Callback when selection changes */
  onChange: (items: TreatmentItem[]) => void
  /** Whether the component is disabled */
  disabled?: boolean
  /** Whether changes are being saved */
  isSaving?: boolean
}

/**
 * Treatment selector with quantity and notes
 */
export function TreatmentSelector({
  items,
  services,
  onChange,
  disabled = false,
  isSaving = false,
}: TreatmentSelectorProps) {
  const [localItems, setLocalItems] = useState<TreatmentItem[]>(items)

  // Sync with parent when items changes externally
  useEffect(() => {
    setLocalItems(items)
  }, [items])

  // Add a new treatment line
  const handleAddTreatment = () => {
    if (services.length === 0) return

    const newItem: TreatmentItem = {
      id: crypto.randomUUID(),
      service_id: '',
      service_nombre: '',
      cantidad: 1,
      nota: '',
    }

    const newItems = [...localItems, newItem]
    setLocalItems(newItems)
    // Don't trigger onChange yet - wait until they select a service
  }

  // Update a treatment line
  const handleUpdateItem = (id: string, updates: Partial<TreatmentItem>) => {
    const newItems = localItems.map(item => {
      if (item.id !== id) return item
      return { ...item, ...updates }
    })
    setLocalItems(newItems)

    // Only trigger onChange if the item has a service selected
    const updatedItem = newItems.find(i => i.id === id)
    if (updatedItem?.service_id) {
      onChange(newItems.filter(i => i.service_id)) // Only send items with service selected
    }
  }

  // Handle service selection
  const handleServiceChange = (id: string, serviceId: string) => {
    const service = services.find(s => s.id === serviceId)
    if (!service) return

    handleUpdateItem(id, {
      service_id: serviceId,
      service_nombre: service.nombre,
    })
  }

  // Remove a treatment line
  const handleRemoveItem = (id: string) => {
    const newItems = localItems.filter(item => item.id !== id)
    setLocalItems(newItems)
    onChange(newItems.filter(i => i.service_id))
  }

  // Count total items
  const totalItems = localItems.filter(i => i.service_id).reduce((sum, item) => sum + item.cantidad, 0)

  return (
    <Card className={cn(disabled && 'opacity-50 pointer-events-none')}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Programa Terapeutico
          {totalItems > 0 && (
            <Badge variant="secondary" className="ml-2">
              {totalItems} sesion{totalItems !== 1 ? 'es' : ''}
            </Badge>
          )}
          {isSaving && (
            <Loader2 className="h-4 w-4 animate-spin ml-2 text-muted-foreground" />
          )}
        </CardTitle>
        <CardDescription>
          Seleccione los tratamientos, cantidad de sesiones y agregue notas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Treatment lines */}
        {localItems.length > 0 && (
          <div className="space-y-3">
            {localItems.map((item, index) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border"
              >
                <div className="text-muted-foreground mt-2">
                  <GripVertical className="h-4 w-4" />
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Service selector */}
                  <div className="sm:col-span-5">
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Tratamiento
                    </Label>
                    <Select
                      value={item.service_id}
                      onValueChange={(value) => handleServiceChange(item.id, value)}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tratamiento" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quantity */}
                  <div className="sm:col-span-2">
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Cantidad
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={item.cantidad}
                      onChange={(e) => handleUpdateItem(item.id, {
                        cantidad: Math.max(1, parseInt(e.target.value) || 1)
                      })}
                      disabled={disabled}
                      className="text-center"
                    />
                  </div>

                  {/* Notes */}
                  <div className="sm:col-span-5">
                    <Label className="text-xs text-muted-foreground mb-1 block">
                      Notas (ej: Pierna izquierda)
                    </Label>
                    <Input
                      type="text"
                      value={item.nota}
                      onChange={(e) => handleUpdateItem(item.id, { nota: e.target.value })}
                      placeholder="Agregar nota..."
                      disabled={disabled}
                    />
                  </div>
                </div>

                {/* Remove button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveItem(item.id)}
                  disabled={disabled}
                  className="text-muted-foreground hover:text-destructive mt-5"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add treatment button */}
        <Button
          type="button"
          variant="outline"
          onClick={handleAddTreatment}
          disabled={disabled || services.length === 0}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar Tratamiento
        </Button>

        {services.length === 0 && (
          <p className="text-sm text-muted-foreground text-center">
            No hay servicios disponibles
          </p>
        )}
      </CardContent>
    </Card>
  )
}
