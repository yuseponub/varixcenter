'use client'

import { useActionState, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { serviceSchema, type ServiceFormData } from '@/lib/validations/service'
import type { Service } from '@/types/services'
import type { ServiceActionState } from '@/app/(protected)/servicios/actions'
import { createService, updateService } from '@/app/(protected)/servicios/actions'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'

interface ServiceFormProps {
  service?: Service | null
  onSuccess?: () => void
}

/**
 * Service form for creating/editing services
 * Shows conditional precio_minimo/maximo fields when precio_variable is true
 */
export function ServiceForm({ service, onSuccess }: ServiceFormProps) {
  const isEditing = Boolean(service)

  // Create bound action for updates
  const boundUpdateAction = service
    ? updateService.bind(null, service.id)
    : createService

  const [state, formAction, isPending] = useActionState<ServiceActionState | null, FormData>(
    boundUpdateAction,
    null
  )

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      nombre: service?.nombre || '',
      descripcion: service?.descripcion || '',
      precio_base: service?.precio_base || 0,
      precio_variable: service?.precio_variable || false,
      precio_minimo: service?.precio_minimo || null,
      precio_maximo: service?.precio_maximo || null,
      activo: service?.activo ?? true,
    },
  })

  const precioVariable = form.watch('precio_variable')

  // Handle successful submission
  useEffect(() => {
    if (state?.success) {
      onSuccess?.()
    }
  }, [state?.success, onSuccess])

  // Update form errors from server
  useEffect(() => {
    if (state?.errors) {
      Object.entries(state.errors).forEach(([field, messages]) => {
        if (messages && messages.length > 0) {
          form.setError(field as keyof ServiceFormData, {
            type: 'server',
            message: messages[0],
          })
        }
      })
    }
  }, [state?.errors, form])

  // Clear min/max when precio_variable is unchecked
  useEffect(() => {
    if (!precioVariable) {
      form.setValue('precio_minimo', null)
      form.setValue('precio_maximo', null)
    }
  }, [precioVariable, form])

  /**
   * Format number as Colombian peso for display
   */
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <Form {...form}>
      <form action={formAction} className="space-y-4">
        {/* General error message */}
        {state?.error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {state.error}
          </div>
        )}

        {/* Nombre */}
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del Servicio</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Escleroterapia" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Descripcion */}
        <FormField
          control={form.control}
          name="descripcion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripcion (opcional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Descripcion del servicio..."
                  className="resize-none"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Precio Base */}
        <FormField
          control={form.control}
          name="precio_base"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Precio Base (COP)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  placeholder="0"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              {field.value > 0 && (
                <FormDescription>
                  {formatCurrency(field.value)}
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Precio Variable Toggle */}
        <FormField
          control={form.control}
          name="precio_variable"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <input type="hidden" name="precio_variable" value={field.value ? 'true' : 'false'} />
              <div className="space-y-1 leading-none">
                <FormLabel>Precio Variable</FormLabel>
                <FormDescription>
                  Permitir ajustar el precio dentro de un rango
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {/* Conditional Price Range Fields */}
        {precioVariable && (
          <div className="grid grid-cols-2 gap-4 rounded-md border p-4 bg-muted/50">
            <FormField
              control={form.control}
              name="precio_minimo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio Minimo</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={1000}
                      placeholder="0"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="precio_maximo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Precio Maximo</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={1000}
                      placeholder="0"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Hidden field for activo */}
        <input type="hidden" name="activo" value={form.getValues('activo') ? 'true' : 'false'} />

        {/* Submit Button */}
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Guardando...' : isEditing ? 'Actualizar Servicio' : 'Crear Servicio'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
