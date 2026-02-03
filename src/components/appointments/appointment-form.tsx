'use client'

import { useActionState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { appointmentSchema, type AppointmentFormData } from '@/lib/validations/appointment'
import { createAppointment, updateAppointment, createAppointmentWithNewPatient, type ActionState } from '@/app/(protected)/citas/actions'
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
import { DateOfBirthInput } from '@/components/ui/date-of-birth-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

/** Patient type for dropdown */
interface Patient {
  id: string
  cedula: string | null
  nombre: string
  apellido: string
  celular: string | null
}

/** Doctor type for dropdown */
interface Doctor {
  id: string
  email: string
  nombre: string | null
  apellido: string | null
}

interface AppointmentFormProps {
  patients?: Patient[]
  doctors: Doctor[]
  /** Mode: create or edit */
  mode?: 'create' | 'edit'
  /** Appointment ID for edit mode */
  appointmentId?: string
  /** Default patient for edit mode */
  defaultPatient?: Patient | null
  /** Pre-fill values from URL params (calendar click) or existing appointment */
  defaultValues?: {
    start?: string
    end?: string
    doctor?: string
    patient?: string
    patientName?: string
    motivo_consulta?: string
    notas?: string
  }
  /** Callback on success (for modal usage) */
  onSuccess?: () => void
  /** Callback on cancel (for modal usage) */
  onCancel?: () => void
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
/** Patient mode: select existing or create new */
type PatientMode = 'existing' | 'new'

/** Duration options in minutes (20 to 180, increments of 5) */
const DURATION_OPTIONS = Array.from({ length: 33 }, (_, i) => 20 + i * 5)

/** Time options from 8:00 to 20:00 in 10-minute intervals */
const TIME_OPTIONS: string[] = []
for (let hour = 8; hour <= 20; hour++) {
  for (let min = 0; min < 60; min += 10) {
    if (hour === 20 && min > 0) break // Stop at 20:00
    const h = hour.toString().padStart(2, '0')
    const m = min.toString().padStart(2, '0')
    TIME_OPTIONS.push(`${h}:${m}`)
  }
}

/**
 * Calculate duration in minutes between two ISO date strings
 */
function calculateDuration(start?: string, end?: string): number {
  if (!start || !end) return 30
  const startDate = new Date(start)
  const endDate = new Date(end)
  const diffMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000)
  // Return closest valid duration or default to 30
  if (diffMinutes >= 20 && diffMinutes <= 180) {
    return Math.round(diffMinutes / 5) * 5
  }
  return 30
}

export function AppointmentForm({
  patients = [],
  doctors,
  mode = 'create',
  appointmentId,
  defaultPatient,
  defaultValues,
  onSuccess,
  onCancel,
}: AppointmentFormProps) {
  const router = useRouter()
  const [patientSearch, setPatientSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(
    defaultPatient || patients.find(p => p.id === defaultValues?.patient) || null
  )
  const [patientMode, setPatientMode] = useState<PatientMode>('existing')
  const [duration, setDuration] = useState<number>(() =>
    calculateDuration(defaultValues?.start, defaultValues?.end)
  )

  // State for new patient fields (to preserve on validation errors)
  const [newPatientData, setNewPatientData] = useState({
    cedula: '',
    celular: '',
    nombre: '',
    apellido: '',
    email: '',
    fecha_nacimiento: '',
    direccion: '',
    contacto_emergencia_nombre: '',
    contacto_emergencia_telefono: '',
    contacto_emergencia_parentesco: '',
  })

  const updateNewPatientField = (field: keyof typeof newPatientData, value: string) => {
    setNewPatientData(prev => ({ ...prev, [field]: value }))
  }

  // Debounced API search for patients
  useEffect(() => {
    if (patientSearch.length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(patientSearch)}`)
        const data = await res.json()
        setSearchResults(data.patients || [])
      } catch (error) {
        console.error('Error searching patients:', error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [patientSearch])

  // Bound action for edit mode or new patient mode
  const boundAction = useCallback(
    (prevState: ActionState | null, formData: FormData) => {
      if (mode === 'edit' && appointmentId) {
        return updateAppointment(appointmentId, prevState, formData)
      }
      if (patientMode === 'new') {
        return createAppointmentWithNewPatient(prevState, formData)
      }
      return createAppointment(prevState, formData)
    },
    [mode, appointmentId, patientMode]
  )

  // Server action with state
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    boundAction,
    null
  )

  // Form with Zod validation
  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patient_id: defaultValues?.patient || '',
      doctor_id: defaultValues?.doctor || '',
      fecha_hora_inicio: defaultValues?.start || '',
      fecha_hora_fin: defaultValues?.end || '',
      motivo_consulta: defaultValues?.motivo_consulta || '',
      notas: defaultValues?.notas || '',
    },
  })

  // Handle success
  useEffect(() => {
    if (state?.success) {
      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/citas')
      }
    }
  }, [state?.success, router, onSuccess])


  return (
    <Form {...form}>
      <form action={formAction} className="space-y-6">
        {/* Server error message */}
        {state?.error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Patient Selection or Creation */}
        <Card>
          <CardHeader>
            <CardTitle>Paciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Patient Mode Toggle (only in create mode) */}
            {mode === 'create' && (
              <RadioGroup
                value={patientMode}
                onValueChange={(v) => setPatientMode(v as PatientMode)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="existing" id="existing" />
                  <Label htmlFor="existing">Paciente Existente</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="new" />
                  <Label htmlFor="new">Nuevo Paciente</Label>
                </div>
              </RadioGroup>
            )}

            {/* Existing Patient Selection */}
            {patientMode === 'existing' && (
              <FormField
                control={form.control}
                name="patient_id"
                render={({ field }) => {
                  const displayName = selectedPatient
                    ? `${selectedPatient.nombre} ${selectedPatient.apellido} (${selectedPatient.cedula || 'Sin cedula'})`
                    : defaultValues?.patientName || ''

                  const showResults = patientSearch.length >= 2

                  return (
                    <FormItem>
                      <FormLabel>Paciente *</FormLabel>
                      <div className="space-y-2">
                        {/* Selected patient display */}
                        {field.value && selectedPatient && (
                          <div className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2">
                            <span className="text-sm font-medium">{displayName}</span>
                            <button
                              type="button"
                              onClick={() => {
                                field.onChange('')
                                setSelectedPatient(null)
                                setPatientSearch('')
                              }}
                              className="text-gray-400 hover:text-gray-600 text-sm"
                            >
                              Cambiar
                            </button>
                          </div>
                        )}

                        {/* Search input - always visible when no patient or changing */}
                        {(!field.value || patientSearch) && (
                          <div className="relative">
                            <Input
                              placeholder="Buscar paciente por nombre o cedula..."
                              value={patientSearch}
                              onChange={(e) => setPatientSearch(e.target.value)}
                              className="w-full"
                              autoComplete="off"
                            />

                            {/* Results dropdown */}
                            {showResults && (
                              <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-[200px] overflow-y-auto">
                                {isSearching ? (
                                  <div className="p-3 text-center text-sm text-muted-foreground flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Buscando...
                                  </div>
                                ) : searchResults.length === 0 ? (
                                  <div className="p-3 text-center text-sm text-muted-foreground">
                                    No se encontraron pacientes
                                  </div>
                                ) : (
                                  searchResults.map((patient) => (
                                    <button
                                      key={patient.id}
                                      type="button"
                                      className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b last:border-b-0"
                                      onClick={() => {
                                        field.onChange(patient.id)
                                        setSelectedPatient(patient)
                                        setPatientSearch('')
                                        setSearchResults([])
                                      }}
                                    >
                                      <span className="font-medium">{patient.nombre} {patient.apellido}</span>
                                      <span className="ml-2 text-muted-foreground text-sm">({patient.cedula || 'Sin cedula'})</span>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Hidden input for form submission */}
                      <input type="hidden" name="patient_id" value={field.value} />
                      <FormMessage />
                      {state?.errors?.patient_id && (
                        <p className="text-sm text-red-600">{state.errors.patient_id[0]}</p>
                      )}
                    </FormItem>
                  )
                }}
              />
            )}

            {/* New Patient Form Fields */}
            {patientMode === 'new' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Cedula */}
                  <div className="space-y-2">
                    <Label htmlFor="cedula">Cedula *</Label>
                    <Input
                      id="cedula"
                      name="cedula"
                      placeholder="1234567890"
                      maxLength={10}
                      value={newPatientData.cedula}
                      onChange={(e) => updateNewPatientField('cedula', e.target.value)}
                    />
                    {state?.errors?.cedula && (
                      <p className="text-sm text-red-600">{state.errors.cedula[0]}</p>
                    )}
                  </div>

                  {/* Celular */}
                  <div className="space-y-2">
                    <Label htmlFor="celular">Celular *</Label>
                    <Input
                      id="celular"
                      name="celular"
                      placeholder="3001234567"
                      maxLength={10}
                      value={newPatientData.celular}
                      onChange={(e) => updateNewPatientField('celular', e.target.value)}
                    />
                    {state?.errors?.celular && (
                      <p className="text-sm text-red-600">{state.errors.celular[0]}</p>
                    )}
                  </div>

                  {/* Nombre */}
                  <div className="space-y-2">
                    <Label htmlFor="nombre">Nombre *</Label>
                    <Input
                      id="nombre"
                      name="nombre"
                      placeholder="Juan"
                      value={newPatientData.nombre}
                      onChange={(e) => updateNewPatientField('nombre', e.target.value)}
                    />
                    {state?.errors?.nombre && (
                      <p className="text-sm text-red-600">{state.errors.nombre[0]}</p>
                    )}
                  </div>

                  {/* Apellido */}
                  <div className="space-y-2">
                    <Label htmlFor="apellido">Apellido *</Label>
                    <Input
                      id="apellido"
                      name="apellido"
                      placeholder="Perez"
                      value={newPatientData.apellido}
                      onChange={(e) => updateNewPatientField('apellido', e.target.value)}
                    />
                    {state?.errors?.apellido && (
                      <p className="text-sm text-red-600">{state.errors.apellido[0]}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="juan@ejemplo.com"
                      value={newPatientData.email}
                      onChange={(e) => updateNewPatientField('email', e.target.value)}
                    />
                  </div>

                  {/* Fecha de Nacimiento */}
                  <div className="space-y-2">
                    <Label>Fecha de Nacimiento</Label>
                    <DateOfBirthInput
                      name="fecha_nacimiento"
                      value={newPatientData.fecha_nacimiento}
                      onChange={(value) => updateNewPatientField('fecha_nacimiento', value)}
                    />
                  </div>

                  {/* Direccion */}
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="direccion">Direccion</Label>
                    <Input
                      id="direccion"
                      name="direccion"
                      placeholder="Calle 123 #45-67, Bucaramanga"
                      value={newPatientData.direccion}
                      onChange={(e) => updateNewPatientField('direccion', e.target.value)}
                    />
                  </div>
                </div>

                {/* Emergency Contact Section (Optional) */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-3">Contacto de Emergencia (opcional)</h4>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="contacto_emergencia_nombre">Nombre</Label>
                      <Input
                        id="contacto_emergencia_nombre"
                        name="contacto_emergencia_nombre"
                        placeholder="Maria Perez"
                        value={newPatientData.contacto_emergencia_nombre}
                        onChange={(e) => updateNewPatientField('contacto_emergencia_nombre', e.target.value)}
                      />
                      {state?.errors?.contacto_emergencia_nombre && (
                        <p className="text-sm text-red-600">{state.errors.contacto_emergencia_nombre[0]}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contacto_emergencia_telefono">Telefono</Label>
                      <Input
                        id="contacto_emergencia_telefono"
                        name="contacto_emergencia_telefono"
                        placeholder="3009876543"
                        maxLength={10}
                        value={newPatientData.contacto_emergencia_telefono}
                        onChange={(e) => updateNewPatientField('contacto_emergencia_telefono', e.target.value)}
                      />
                      {state?.errors?.contacto_emergencia_telefono && (
                        <p className="text-sm text-red-600">{state.errors.contacto_emergencia_telefono[0]}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contacto_emergencia_parentesco">Parentesco</Label>
                      <Input
                        id="contacto_emergencia_parentesco"
                        name="contacto_emergencia_parentesco"
                        placeholder="Esposa"
                        value={newPatientData.contacto_emergencia_parentesco}
                        onChange={(e) => updateNewPatientField('contacto_emergencia_parentesco', e.target.value)}
                      />
                      {state?.errors?.contacto_emergencia_parentesco && (
                        <p className="text-sm text-red-600">{state.errors.contacto_emergencia_parentesco[0]}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Doctor Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Doctor</CardTitle>
          </CardHeader>
          <CardContent>

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
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {/* Date */}
            <FormField
              control={form.control}
              name="fecha_hora_inicio"
              render={({ field }) => {
                // Extract date part from ISO string
                const getDatePart = (isoString?: string) => {
                  if (!isoString) return ''
                  const date = new Date(isoString)
                  const year = date.getFullYear()
                  const month = String(date.getMonth() + 1).padStart(2, '0')
                  const day = String(date.getDate()).padStart(2, '0')
                  return `${year}-${month}-${day}`
                }

                // Extract time part from ISO string
                const getTimePart = (isoString?: string) => {
                  if (!isoString) return '08:00'
                  const date = new Date(isoString)
                  const hours = String(date.getHours()).padStart(2, '0')
                  const minutes = String(Math.floor(date.getMinutes() / 10) * 10).padStart(2, '0')
                  return `${hours}:${minutes}`
                }

                const currentDate = getDatePart(field.value)
                const currentTime = getTimePart(field.value)

                // Combine date and time into ISO string
                const combineDateTime = (date: string, time: string) => {
                  if (!date) return ''
                  const [hours, minutes] = time.split(':').map(Number)
                  // Parse date parts manually to avoid UTC timezone shift
                  const [year, month, day] = date.split('-').map(Number)
                  const dateObj = new Date(year, month - 1, day, hours, minutes, 0, 0)
                  return dateObj.toISOString()
                }

                // Calculate end time based on start + duration
                const calculateEndTime = (startIso: string) => {
                  if (!startIso) return ''
                  const startDate = new Date(startIso)
                  const endDate = new Date(startDate.getTime() + duration * 60000)
                  return endDate.toISOString()
                }

                const endTimeIso = calculateEndTime(field.value)

                return (
                  <>
                    <FormItem>
                      <FormLabel>Fecha *</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={currentDate}
                          onChange={(e) => {
                            const newIso = combineDateTime(e.target.value, currentTime)
                            field.onChange(newIso)
                            if (newIso) {
                              const endDate = new Date(new Date(newIso).getTime() + duration * 60000)
                              form.setValue('fecha_hora_fin', endDate.toISOString())
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                      {state?.errors?.fecha_hora_inicio && (
                        <p className="text-sm text-red-600">{state.errors.fecha_hora_inicio[0]}</p>
                      )}
                    </FormItem>

                    {/* Time Dropdown */}
                    <div className="space-y-2">
                      <Label>Hora *</Label>
                      <Select
                        value={currentTime}
                        onValueChange={(newTime) => {
                          const newIso = combineDateTime(currentDate, newTime)
                          field.onChange(newIso)
                          if (newIso) {
                            const endDate = new Date(new Date(newIso).getTime() + duration * 60000)
                            form.setValue('fecha_hora_fin', endDate.toISOString())
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar hora" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Hidden inputs for form submission */}
                    <input type="hidden" name="fecha_hora_inicio" value={field.value} />
                    <input type="hidden" name="fecha_hora_fin" value={endTimeIso} />
                  </>
                )
              }}
            />

            {/* Duration Dropdown */}
            <div className="space-y-2">
              <Label>Duracion *</Label>
              <Select
                value={duration.toString()}
                onValueChange={(v) => {
                  const newDuration = parseInt(v)
                  setDuration(newDuration)
                  // Update end time if start is set
                  const startValue = form.getValues('fecha_hora_inicio')
                  if (startValue) {
                    const endDate = new Date(new Date(startValue).getTime() + newDuration * 60000)
                    form.setValue('fecha_hora_fin', endDate.toISOString())
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar duracion" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((mins) => (
                    <SelectItem key={mins} value={mins.toString()}>
                      {mins} minutos
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state?.errors?.fecha_hora_fin && (
                <p className="text-sm text-red-600">{state.errors.fecha_hora_fin[0]}</p>
              )}
            </div>
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
            onClick={onCancel || (() => router.push('/citas'))}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? mode === 'edit'
                ? 'Guardando...'
                : patientMode === 'new'
                  ? 'Creando Paciente y Cita...'
                  : 'Creando...'
              : mode === 'edit'
                ? 'Guardar Cambios'
                : patientMode === 'new'
                  ? 'Crear Paciente y Cita'
                  : 'Crear Cita'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
