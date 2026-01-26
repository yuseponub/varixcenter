'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Briefcase, Lock, Loader2 } from 'lucide-react'

interface Service {
  id: string
  nombre: string
  descripcion: string | null
  precio_base: number
  precio_variable: boolean
  precio_minimo: number | null
  precio_maximo: number | null
}

interface SectionTreatmentProps {
  tratamientoIds: string[]
  onChange: (ids: string[]) => void
  services: Service[]
  disabled?: boolean
  isMedicoOnly?: boolean
  isLoading?: boolean
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

/**
 * Section for therapeutic program (treatment selection)
 * Shows available services as checkboxes
 * Only editable by medico
 */
export function SectionTreatment({
  tratamientoIds,
  onChange,
  services,
  disabled = false,
  isMedicoOnly = false,
  isLoading = false,
}: SectionTreatmentProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(tratamientoIds))

  useEffect(() => {
    setSelectedIds(new Set(tratamientoIds))
  }, [tratamientoIds])

  const handleToggle = (serviceId: string, checked: boolean) => {
    const newSelected = new Set(selectedIds)
    if (checked) {
      newSelected.add(serviceId)
    } else {
      newSelected.delete(serviceId)
    }
    setSelectedIds(newSelected)
    onChange(Array.from(newSelected))
  }

  const selectedServices = services.filter((s) => selectedIds.has(s.id))
  const estimatedTotal = selectedServices.reduce((sum, s) => sum + s.precio_base, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Programa Terapeutico
          </CardTitle>
          {isMedicoOnly && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Solo Medico
            </Badge>
          )}
        </div>
        <CardDescription>
          Seleccione los procedimientos recomendados para el paciente
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Cargando servicios...</span>
          </div>
        ) : services.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No hay servicios disponibles
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3">
              {services.map((service) => (
                <div
                  key={service.id}
                  className={`flex items-start space-x-3 p-3 rounded-lg border ${
                    selectedIds.has(service.id)
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-background'
                  }`}
                >
                  <Checkbox
                    id={service.id}
                    checked={selectedIds.has(service.id)}
                    onCheckedChange={(checked) => handleToggle(service.id, checked === true)}
                    disabled={disabled}
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={service.id}
                      className="text-sm font-medium cursor-pointer"
                    >
                      {service.nombre}
                    </Label>
                    {service.descripcion && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {service.descripcion}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {formatCurrency(service.precio_base)}
                    </p>
                    {service.precio_variable && (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(service.precio_minimo || 0)} -{' '}
                        {formatCurrency(service.precio_maximo || 0)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            {selectedServices.length > 0 && (
              <div className="pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">
                    Servicios seleccionados: {selectedServices.length}
                  </span>
                  <span className="text-lg font-bold">
                    {formatCurrency(estimatedTotal)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  * Los precios variables se ajustaran en la cotizacion final
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
