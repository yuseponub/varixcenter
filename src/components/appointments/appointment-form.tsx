'use client'

import { useActionState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { appointmentSchema, type AppointmentFormData } from '@/lib/validations/appointment'
import { createAppointment, type ActionState } from '@/app/(protected)/citas/actions'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Patient type for dropdown */
interface Patient {
  id: string
  cedula: string
  nombre: string
  apellido: string
  celular: string
}

/** Doctor type for dropdown */
interface Doctor {
  id: string
  email: string
  nombre: string | null
  apellido: string | null
}

interface AppointmentFormProps {
  patients: Patient[]
  doctors: Doctor[]
  /** Pre-fill values from URL params (calendar click) */
  defaultValues?: {
    start?: string
    end?: string
    doctor?: string
  }
}

/**
 * Convert ISO datetime string to local datetime-local input format
 * datetime-local expects "YYYY-MM-DDTHH:mm"
 */
function toLocalDatetimeInput(isoString?: string): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * Convert datetime-local input value to ISO string
 */
function toIsoString(localDatetime: string): string {
  if (!localDatetime) return ''
  const date = new Date(localDatetime)
  return date.toISOString()
}

/**
 * Appointment form for creating new appointments
 *
 * Features:
 * - Patient dropdown with search
 * - Doctor dropdown
 * - Datetime inputs (prefilled from URL params)
 * - Optional notes and motivo consulta
 * - Spanish validation messages
 * - Redirects to calendar on success
 */
export function AppointmentForm({ patients, doctors, defaultValues }: AppointmentFormProps) {
  const router = useRouter()
  const [patientSearch, setPatientSearch] = useState('')

  // Server action with state
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    createAppointment,
    null
  )

  // Form with Zod validation
  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patient_id: '',
      doctor_id: defaultValues?.doctor || '',
      fecha_hora_inicio: defaultValues?.start || '',
      fecha_hora_fin: defaultValues?.end || '',
      motivo_consulta: '',
      notas: '',
    },
  })

  // Redirect to calendar on success
  useEffect(() => {
    if (state?.success) {
      router.push('/citas')
    }
  }, [state?.success, router])

  // Filter patients for dropdown search
  const filteredPatients = patientSearch
    ? patients.filter((p) =>
        `${p.cedula} ${p.nombre} ${p.apellido} ${p.celular}`
          .toLowerCase()
          .includes(patientSearch.toLowerCase())
      )
    : patients

  return (
    <Form {...form}>
      <form action={formAction} className="space-y-6">
        {/* Server error message */}
        {state?.error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Patient and Doctor Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Seleccionar Paciente y Doctor</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Patient Selection */}
            <FormField
              control={form.control}
              name="patient_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paciente *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar paciente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* Search input inside dropdown */}
                      <div className="p-2">
                        <Input
                          placeholder="Buscar por cedula, nombre..."
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          className="h-8"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      {filteredPatients.length === 0 ? (
                        <div className="p-2 text-center text-sm text-muted-foreground">
                          No se encontraron pacientes
                        </div>
                      ) : (
                        filteredPatients.map((patient) => (
                          <SelectItem key={patient.id} value={patient.id}>
                            <span className="font-medium">{patient.nombre} {patient.apellido}</span>
                            <span className="ml-2 text-muted-foreground">({patient.cedula})</span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {/* Hidden input for form submission */}
                  <input type="hidden" name="patient_id" value={field.value} />
                  <FormMessage />
                  {state?.errors?.patient_id && (
                    <p className="text-sm text-red-600">{state.errors.patient_id[0]}</p>
                  )}
                </FormItem>
              )}
            />

            {/* Doctor Selection */}
            <FormField
              control={form.control}
              name="doctor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Doctor *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar doctor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {doctors.length === 0 ? (
                        <div className="p-2 text-center text-sm text-muted-foreground">
                          No hay doctores disponibles
                        </div>
                      ) : (
                        doctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            {doctor.nombre && doctor.apellido
                              ? `${doctor.nombre} ${doctor.apellido}`
                              : doctor.email}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {/* Hidden input for form submission */}
                  <input type="hidden" name="doctor_id" value={field.value} />
                  <FormMessage />
                  {state?.errors?.doctor_id && (
                    <p className="text-sm text-red-600">{state.errors.doctor_id[0]}</p>
                  )}
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Date and Time */}
        <Card>
          <CardHeader>
            <CardTitle>Fecha y Hora</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Start DateTime */}
            <FormField
              control={form.control}
              name="fecha_hora_inicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inicio *</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      value={toLocalDatetimeInput(field.value)}
                      onChange={(e) => field.onChange(toIsoString(e.target.value))}
                    />
                  </FormControl>
                  {/* Hidden input with ISO format for form submission */}
                  <input type="hidden" name="fecha_hora_inicio" value={field.value} />
                  <FormMessage />
                  {state?.errors?.fecha_hora_inicio && (
                    <p className="text-sm text-red-600">{state.errors.fecha_hora_inicio[0]}</p>
                  )}
                </FormItem>
              )}
            />

            {/* End DateTime */}
            <FormField
              control={form.control}
              name="fecha_hora_fin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fin *</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      value={toLocalDatetimeInput(field.value)}
                      onChange={(e) => field.onChange(toIsoString(e.target.value))}
                    />
                  </FormControl>
                  {/* Hidden input with ISO format for form submission */}
                  <input type="hidden" name="fecha_hora_fin" value={field.value} />
                  <FormMessage />
                  {state?.errors?.fecha_hora_fin && (
                    <p className="text-sm text-red-600">{state.errors.fecha_hora_fin[0]}</p>
                  )}
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Notes and Reason */}
        <Card>
          <CardHeader>
            <CardTitle>Detalles de la Cita</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Motivo Consulta */}
            <FormField
              control={form.control}
              name="motivo_consulta"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo de Consulta</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      name="motivo_consulta"
                      placeholder="Razon de la cita..."
                      className="min-h-[80px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas Adicionales</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      name="notas"
                      placeholder="Notas internas sobre la cita..."
                      className="min-h-[80px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/citas')}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Creando...' : 'Crear Cita'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
