'use client'

import { useActionState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  patientSchema,
  patientUpdateSchema,
  type PatientFormData,
} from '@/lib/validations/patient'
import { createPatient } from '@/app/(protected)/pacientes/nuevo/actions'
import { updatePatient } from '@/app/(protected)/pacientes/[id]/editar/actions'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DateOfBirthInput } from '@/components/ui/date-of-birth-input'

interface PatientFormProps {
  mode: 'create' | 'edit'
  patientId?: string
  defaultValues?: Partial<PatientFormData>
}

/**
 * Reusable patient form for create and edit operations
 *
 * In edit mode:
 * - cedula field is disabled (database trigger also prevents changes)
 * - Uses patientUpdateSchema (cedula omitted from validation)
 */
export function PatientForm({ mode, patientId, defaultValues }: PatientFormProps) {
  const isEdit = mode === 'edit'

  // Server action with state
  const boundUpdateAction = patientId
    ? updatePatient.bind(null, patientId)
    : undefined

  const [state, formAction, pending] = useActionState(
    isEdit && boundUpdateAction ? boundUpdateAction : createPatient,
    null
  )

  // Form with Zod validation
  // Use type assertion to handle the conditional schema - cedula is always in the form
  // but only validated on create. The disabled field prevents changes on edit.
  const form = useForm<PatientFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(isEdit ? patientUpdateSchema : patientSchema) as any,
    defaultValues: {
      cedula: '',
      nombre: '',
      apellido: '',
      celular: '',
      email: '',
      fecha_nacimiento: '',
      direccion: '',
      contacto_emergencia_nombre: '',
      contacto_emergencia_telefono: '',
      contacto_emergencia_parentesco: '',
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form action={formAction} className="space-y-6">
        {/* Server error message */}
        {state?.error && (
          <div className="rounded-md bg-destructive-soft p-4 text-sm text-destructive">
            {state.error}
          </div>
        )}

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informacion Personal</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Cedula */}
            <FormField
              control={form.control}
              name="cedula"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cedula *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.replace(/\D/g, '').slice(0, 10))
                      }
                      placeholder="1234567890"
                      inputMode="numeric"
                      autoFocus
                      disabled={isEdit}
                      className={isEdit ? 'bg-neutral-badge' : ''}
                    />
                  </FormControl>
                  <FormMessage />
                  {state?.errors?.cedula && (
                    <p className="text-sm text-destructive">{state.errors.cedula[0]}</p>
                  )}
                  {isEdit && (
                    <p className="text-xs text-muted-foreground">
                      La cedula no puede ser modificada
                    </p>
                  )}
                </FormItem>
              )}
            />

            {/* Nombre */}
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Juan" />
                  </FormControl>
                  <FormMessage />
                  {state?.errors?.nombre && (
                    <p className="text-sm text-destructive">{state.errors.nombre[0]}</p>
                  )}
                </FormItem>
              )}
            />

            {/* Apellido */}
            <FormField
              control={form.control}
              name="apellido"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apellido *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Perez" />
                  </FormControl>
                  <FormMessage />
                  {state?.errors?.apellido && (
                    <p className="text-sm text-destructive">{state.errors.apellido[0]}</p>
                  )}
                </FormItem>
              )}
            />

            {/* Celular */}
            <FormField
              control={form.control}
              name="celular"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Celular *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.replace(/\D/g, '').slice(0, 10))
                      }
                      placeholder="3001234567"
                      type="tel"
                      inputMode="numeric"
                    />
                  </FormControl>
                  <FormMessage />
                  {state?.errors?.celular && (
                    <p className="text-sm text-destructive">{state.errors.celular[0]}</p>
                  )}
                </FormItem>
              )}
            />

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="juan@ejemplo.com" type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Fecha de Nacimiento */}
            <FormField
              control={form.control}
              name="fecha_nacimiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Nacimiento</FormLabel>
                  <FormControl>
                    <DateOfBirthInput
                      name="fecha_nacimiento"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Direccion */}
            <FormField
              control={form.control}
              name="direccion"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Direccion</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Calle 123 #45-67, Bucaramanga" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Contacto de Emergencia (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Nombre Contacto */}
            <FormField
              control={form.control}
              name="contacto_emergencia_nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Maria Garcia" />
                  </FormControl>
                  <FormMessage />
                  {state?.errors?.contacto_emergencia_nombre && (
                    <p className="text-sm text-destructive">
                      {state.errors.contacto_emergencia_nombre[0]}
                    </p>
                  )}
                </FormItem>
              )}
            />

            {/* Telefono Contacto */}
            <FormField
              control={form.control}
              name="contacto_emergencia_telefono"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="3009876543" type="tel" />
                  </FormControl>
                  <FormMessage />
                  {state?.errors?.contacto_emergencia_telefono && (
                    <p className="text-sm text-destructive">
                      {state.errors.contacto_emergencia_telefono[0]}
                    </p>
                  )}
                </FormItem>
              )}
            />

            {/* Parentesco */}
            <FormField
              control={form.control}
              name="contacto_emergencia_parentesco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parentesco</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Esposa, Hijo, Hermano..." />
                  </FormControl>
                  <FormMessage />
                  {state?.errors?.contacto_emergencia_parentesco && (
                    <p className="text-sm text-destructive">
                      {state.errors.contacto_emergencia_parentesco[0]}
                    </p>
                  )}
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? 'Guardando...' : isEdit ? 'Actualizar Paciente' : 'Registrar Paciente'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
