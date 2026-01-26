'use client'

import { useActionState, useEffect, useState } from 'react'
import type { Service } from '@/types/services'
import type { ServiceActionState } from '@/app/(protected)/servicios/actions'
import { createService, updateService } from '@/app/(protected)/servicios/actions'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface ServiceFormProps {
  service?: Service | null
  onSuccess?: () => void
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function ServiceForm({ service, onSuccess }: ServiceFormProps) {
  const isEditing = Boolean(service)

  const boundUpdateAction = service
    ? updateService.bind(null, service.id)
    : createService

  const [state, formAction, isPending] = useActionState<ServiceActionState | null, FormData>(
    boundUpdateAction,
    null
  )

  const [precioVariable, setPrecioVariable] = useState(service?.precio_variable || false)
  const [precioBase, setPrecioBase] = useState(service?.precio_base || 0)

  useEffect(() => {
    if (state?.success) {
      onSuccess?.()
    }
  }, [state?.success, onSuccess])

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* Nombre */}
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre del Servicio *</Label>
        <Input
          id="nombre"
          name="nombre"
          placeholder="Ej: Escleroterapia"
          defaultValue={service?.nombre || ''}
          required
        />
        {state?.errors?.nombre && (
          <p className="text-sm text-destructive">{state.errors.nombre[0]}</p>
        )}
      </div>

      {/* Descripcion */}
      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripcion (opcional)</Label>
        <Textarea
          id="descripcion"
          name="descripcion"
          placeholder="Descripcion del servicio..."
          className="resize-none"
          defaultValue={service?.descripcion || ''}
        />
      </div>

      {/* Precio Base */}
      <div className="space-y-2">
        <Label htmlFor="precio_base">Precio Base (COP) *</Label>
        <Input
          id="precio_base"
          name="precio_base"
          type="number"
          min={0}
          step={1000}
          placeholder="0"
          value={precioBase}
          onChange={(e) => setPrecioBase(parseFloat(e.target.value) || 0)}
          required
        />
        {precioBase > 0 && (
          <p className="text-sm text-muted-foreground">{formatCurrency(precioBase)}</p>
        )}
        {state?.errors?.precio_base && (
          <p className="text-sm text-destructive">{state.errors.precio_base[0]}</p>
        )}
      </div>

      {/* Precio Variable Toggle */}
      <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
        <Checkbox
          id="precio_variable_check"
          checked={precioVariable}
          onCheckedChange={(checked) => setPrecioVariable(checked === true)}
        />
        <input type="hidden" name="precio_variable" value={precioVariable ? 'true' : 'false'} />
        <div className="space-y-1 leading-none">
          <Label htmlFor="precio_variable_check">Precio Variable</Label>
          <p className="text-sm text-muted-foreground">
            Permitir ajustar el precio dentro de un rango
          </p>
        </div>
      </div>

      {/* Conditional Price Range Fields */}
      {precioVariable && (
        <div className="grid grid-cols-2 gap-4 rounded-md border p-4 bg-muted/50">
          <div className="space-y-2">
            <Label htmlFor="precio_minimo">Precio Minimo *</Label>
            <Input
              id="precio_minimo"
              name="precio_minimo"
              type="number"
              min={0}
              step={1000}
              placeholder="0"
              defaultValue={service?.precio_minimo || ''}
              required={precioVariable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="precio_maximo">Precio Maximo *</Label>
            <Input
              id="precio_maximo"
              name="precio_maximo"
              type="number"
              min={0}
              step={1000}
              placeholder="0"
              defaultValue={service?.precio_maximo || ''}
              required={precioVariable}
            />
          </div>
        </div>
      )}

      {/* Hidden field for activo */}
      <input type="hidden" name="activo" value="true" />

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : isEditing ? 'Actualizar Servicio' : 'Crear Servicio'}
        </Button>
      </div>
    </form>
  )
}
