'use client'

/**
 * Treatment Selector Component with Body Zones
 *
 * Allows doctors to select treatments organized by body zone.
 * Each zone can have multiple treatments with quantity and notes.
 *
 * Zones: Pierna derecha, Pierna izquierda, Mano derecha, Mano izquierda, Cara
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
import { Loader2, Plus, Trash2, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

// Available body zones
export const BODY_ZONES = [
  { id: 'pierna_derecha', label: 'Pierna Derecha', short: 'MID' },
  { id: 'pierna_izquierda', label: 'Pierna Izquierda', short: 'MII' },
  { id: 'mano_derecha', label: 'Mano Derecha', short: 'MD' },
  { id: 'mano_izquierda', label: 'Mano Izquierda', short: 'MI' },
  { id: 'cara', label: 'Cara', short: 'Cara' },
] as const

export type BodyZone = typeof BODY_ZONES[number]['id']

export interface TreatmentItem {
  id: string // unique id for this line item
  service_id: string
  service_nombre: string
  cantidad: number
  nota: string
  zona: BodyZone
}

interface Service {
  id: string
  nombre: string
}

interface ZoneData {
  zona: BodyZone
  items: TreatmentItem[]
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
 * Get zone label from id
 */
function getZoneLabel(zoneId: BodyZone): string {
  return BODY_ZONES.find(z => z.id === zoneId)?.label || zoneId
}

/**
 * Get zone short label from id
 */
function getZoneShort(zoneId: BodyZone): string {
  return BODY_ZONES.find(z => z.id === zoneId)?.short || zoneId
}

/**
 * Treatment selector with body zones
 */
export function TreatmentSelector({
  items,
  services,
  onChange,
  disabled = false,
  isSaving = false,
}: TreatmentSelectorProps) {
  // Group items by zone
  const [zones, setZones] = useState<ZoneData[]>(() => {
    const grouped = new Map<BodyZone, TreatmentItem[]>()
    items.forEach(item => {
      const zone = item.zona || 'pierna_derecha'
      if (!grouped.has(zone)) {
        grouped.set(zone, [])
      }
      grouped.get(zone)!.push(item)
    })
    return Array.from(grouped.entries()).map(([zona, items]) => ({ zona, items }))
  })

  // Track which zone selector is open
  const [showZoneSelector, setShowZoneSelector] = useState(false)

  // Sync with parent when items change externally
  useEffect(() => {
    const grouped = new Map<BodyZone, TreatmentItem[]>()
    items.forEach(item => {
      const zone = item.zona || 'pierna_derecha'
      if (!grouped.has(zone)) {
        grouped.set(zone, [])
      }
      grouped.get(zone)!.push(item)
    })
    setZones(Array.from(grouped.entries()).map(([zona, items]) => ({ zona, items })))
  }, [items])

  // Get all items flattened for onChange
  const getAllItems = (updatedZones: ZoneData[]): TreatmentItem[] => {
    return updatedZones.flatMap(z => z.items.filter(i => i.service_id))
  }

  // Get zones that are already added
  const usedZones = new Set(zones.map(z => z.zona))

  // Add a new zone
  const handleAddZone = (zoneId: BodyZone) => {
    if (usedZones.has(zoneId)) return

    const newZones = [...zones, { zona: zoneId, items: [] }]
    setZones(newZones)
    setShowZoneSelector(false)
  }

  // Remove a zone
  const handleRemoveZone = (zoneId: BodyZone) => {
    const newZones = zones.filter(z => z.zona !== zoneId)
    setZones(newZones)
    onChange(getAllItems(newZones))
  }

  // Add treatment to a zone
  const handleAddTreatment = (zoneId: BodyZone) => {
    if (services.length === 0) return

    const newItem: TreatmentItem = {
      id: crypto.randomUUID(),
      service_id: '',
      service_nombre: '',
      cantidad: 1,
      nota: '',
      zona: zoneId,
    }

    const newZones = zones.map(z => {
      if (z.zona !== zoneId) return z
      return { ...z, items: [...z.items, newItem] }
    })

    setZones(newZones)
  }

  // Update a treatment item
  const handleUpdateItem = (zoneId: BodyZone, itemId: string, updates: Partial<TreatmentItem>) => {
    const newZones = zones.map(z => {
      if (z.zona !== zoneId) return z
      return {
        ...z,
        items: z.items.map(item => {
          if (item.id !== itemId) return item
          return { ...item, ...updates }
        }),
      }
    })

    setZones(newZones)

    // Check if item has service selected
    const updatedZone = newZones.find(z => z.zona === zoneId)
    const updatedItem = updatedZone?.items.find(i => i.id === itemId)
    if (updatedItem?.service_id) {
      onChange(getAllItems(newZones))
    }
  }

  // Handle service selection
  const handleServiceChange = (zoneId: BodyZone, itemId: string, serviceId: string) => {
    const service = services.find(s => s.id === serviceId)
    if (!service) return

    handleUpdateItem(zoneId, itemId, {
      service_id: serviceId,
      service_nombre: service.nombre,
    })
  }

  // Remove a treatment item
  const handleRemoveItem = (zoneId: BodyZone, itemId: string) => {
    const newZones = zones.map(z => {
      if (z.zona !== zoneId) return z
      return { ...z, items: z.items.filter(item => item.id !== itemId) }
    })

    setZones(newZones)
    onChange(getAllItems(newZones))
  }

  // Count total items
  const totalItems = zones.flatMap(z => z.items).filter(i => i.service_id).reduce((sum, item) => sum + item.cantidad, 0)

  return (
    <div className={cn('space-y-4', disabled && 'opacity-50 pointer-events-none')}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">Programa Terapeutico</span>
          {totalItems > 0 && (
            <Badge variant="secondary">
              {totalItems} sesion{totalItems !== 1 ? 'es' : ''}
            </Badge>
          )}
          {isSaving && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Zones */}
      {zones.length > 0 && (
        <div className="space-y-4">
          {zones.map((zone) => (
            <Card key={zone.zona}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {getZoneLabel(zone.zona)}
                    {zone.items.filter(i => i.service_id).length > 0 && (
                      <Badge variant="outline" className="ml-2">
                        {zone.items.filter(i => i.service_id).length}
                      </Badge>
                    )}
                  </CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveZone(zone.zona)}
                    disabled={disabled}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {/* Treatment items for this zone */}
                {zone.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 p-2 bg-muted/30 rounded-lg border"
                  >
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2">
                      {/* Service selector */}
                      <div className="sm:col-span-5">
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Tratamiento
                        </Label>
                        <Select
                          value={item.service_id}
                          onValueChange={(value) => handleServiceChange(zone.zona, item.id, value)}
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Seleccionar..." />
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
                          Cant.
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={item.cantidad}
                          onChange={(e) => handleUpdateItem(zone.zona, item.id, {
                            cantidad: Math.max(1, parseInt(e.target.value) || 1)
                          })}
                          disabled={disabled}
                          className="text-center h-9"
                        />
                      </div>

                      {/* Notes */}
                      <div className="sm:col-span-5">
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Observaciones
                        </Label>
                        <Input
                          type="text"
                          value={item.nota}
                          onChange={(e) => handleUpdateItem(zone.zona, item.id, { nota: e.target.value })}
                          placeholder="Agregar nota..."
                          disabled={disabled}
                          className="h-9"
                        />
                      </div>
                    </div>

                    {/* Remove button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveItem(zone.zona, item.id)}
                      disabled={disabled}
                      className="text-muted-foreground hover:text-destructive mt-5 h-8 w-8"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}

                {/* Add treatment button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddTreatment(zone.zona)}
                  disabled={disabled || services.length === 0}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar Tratamiento
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add zone button */}
      {!showZoneSelector ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowZoneSelector(true)}
          disabled={disabled || usedZones.size === BODY_ZONES.length}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar Zona de Tratamiento
        </Button>
      ) : (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Seleccionar zona del cuerpo</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BODY_ZONES.filter(z => !usedZones.has(z.id)).map((zone) => (
                <Button
                  key={zone.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddZone(zone.id)}
                  disabled={disabled}
                  className="justify-start"
                >
                  <MapPin className="h-3 w-3 mr-2" />
                  {zone.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowZoneSelector(false)}
              className="mt-2 w-full"
            >
              Cancelar
            </Button>
          </CardContent>
        </Card>
      )}

      {services.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          No hay servicios disponibles
        </p>
      )}

      {zones.length === 0 && !showZoneSelector && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Agregue una zona de tratamiento para comenzar
        </p>
      )}
    </div>
  )
}
