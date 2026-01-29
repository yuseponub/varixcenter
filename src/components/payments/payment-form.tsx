'use client'

import { useActionState, useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ServiceSelector } from './service-selector'
import { PaymentMethodForm } from './payment-method-form'
import { PaymentSummary } from './payment-summary'
import { PendingServicesSelector } from './pending-services-selector'
import { createPayment, type PaymentActionState } from '@/app/(protected)/pagos/actions'
import { getPendingServicesGroupedAction } from '@/app/(protected)/pagos/pending-services-action'
import type { ServiceOption } from '@/types/services'
import type { PaymentItemInput, PaymentMethodInput } from '@/types/payments'
import { requiresComprobante } from '@/types/payments'
import type { PendingServicesGroup, PaymentItemWithAppointmentService } from '@/types/appointment-services'

interface Patient {
  id: string
  cedula: string
  nombre: string
  apellido: string
}

interface PaymentFormProps {
  services: ServiceOption[]
  patients: Patient[]
  defaultPatientId?: string
  initialPendingServices?: PendingServicesGroup[]
}

/**
 * Complete payment form component
 *
 * Composes ServiceSelector, PaymentMethodForm, PendingServicesSelector, and PaymentSummary.
 * Handles discount with justification requirement.
 * Validates all fields before enabling submit.
 * Auto-updates first method amount when items change.
 * Supports both appointment services and direct catalog services.
 * Redirects to detail page on success.
 */
export function PaymentForm({
  services,
  patients,
  defaultPatientId,
  initialPendingServices = [],
}: PaymentFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<PaymentActionState | null, FormData>(
    createPayment,
    null
  )
  const [isLoadingPending, startLoadingTransition] = useTransition()

  // Form state
  const [patientId, setPatientId] = useState(defaultPatientId || '')
  const [patientSearch, setPatientSearch] = useState('')
  const [directItems, setDirectItems] = useState<PaymentItemInput[]>([])
  const [pendingServiceItems, setPendingServiceItems] = useState<PaymentItemWithAppointmentService[]>([])
  const [pendingServicesGroups, setPendingServicesGroups] = useState<PendingServicesGroup[]>(initialPendingServices)
  const [methods, setMethods] = useState<PaymentMethodInput[]>([{
    metodo: 'efectivo',
    monto: 0,
    comprobante_path: null
  }])
  const [descuento, setDescuento] = useState(0)
  const [descuentoJustificacion, setDescuentoJustificacion] = useState('')

  // Combine all items for calculations and display
  const allItems: PaymentItemWithAppointmentService[] = [
    ...directItems.map(item => ({ ...item, appointment_service_id: null })),
    ...pendingServiceItems,
  ]

  // Calculated values
  const subtotal = allItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const total = subtotal - descuento
  const methodsTotal = methods.reduce((sum, m) => sum + m.monto, 0)
  const isBalanced = Math.abs(total - methodsTotal) < 0.01

  // Fetch pending services when patient changes
  useEffect(() => {
    if (patientId) {
      startLoadingTransition(async () => {
        const groups = await getPendingServicesGroupedAction(patientId)
        setPendingServicesGroups(groups)
        // Clear pending service selections when patient changes
        setPendingServiceItems([])
      })
    } else {
      setPendingServicesGroups([])
      setPendingServiceItems([])
    }
  }, [patientId])

  // Auto-update first method amount to match total when there's only one method
  useEffect(() => {
    setMethods(prev => {
      if (prev.length === 1 && prev[0].monto !== total && total >= 0) {
        return [{ ...prev[0], monto: total }]
      }
      return prev
    })
  }, [total])

  // Handle success/error
  useEffect(() => {
    if (state?.success && state.data) {
      toast.success(`Pago registrado: ${state.data.numero_factura}`)
      router.push(`/pagos/${state.data.id}`)
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, router])

  // Normalize text for phonetic search (Spanish)
  const normalizeForSearch = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[csz]/g, 's')          // S = C = Z
      .replace(/[bv]/g, 'b')           // B = V
      .replace(/[yi]/g, 'i')           // Y = I
      .replace(/ñ/g, 'n')              // Ñ = N
      .replace(/[^a-z0-9\s]/g, '')     // Remove special chars
      .replace(/\s+/g, ' ')            // Normalize spaces
      .trim()
  }

  // Filter patients for search - smart phonetic matching
  const filteredPatients = patientSearch.length >= 2
    ? patients.filter((p) => {
        const searchTerm = patientSearch.trim()

        // Numeric search (cedula)
        if (/^\d+$/.test(searchTerm)) {
          const cedula = (p.cedula || '').toLowerCase()
          return cedula.includes(searchTerm)
        }

        // Name search with phonetic matching
        const words = searchTerm.split(/\s+/).filter(w => w.length > 0)
        const normalizedWords = words.map(w => normalizeForSearch(w))
        const fullName = normalizeForSearch(`${p.nombre || ''} ${p.apellido || ''}`)

        return normalizedWords.every(word => fullName.includes(word))
      })
    : []

  // Get selected patient display name
  const selectedPatient = patients.find(p => p.id === patientId)
  const selectedPatientName = selectedPatient
    ? `${selectedPatient.nombre} ${selectedPatient.apellido} (${selectedPatient.cedula || 'Sin cedula'})`
    : ''

  // Validation
  const canSubmit =
    patientId &&
    allItems.length > 0 &&
    methods.length > 0 &&
    isBalanced &&
    (descuento === 0 || descuentoJustificacion.length >= 5) &&
    methods.every(m => !requiresComprobante(m.metodo) || m.comprobante_path)

  const handleSubmit = (formData: FormData) => {
    // Add JSON data to form
    formData.set('patient_id', patientId)
    formData.set('items', JSON.stringify(allItems))
    formData.set('methods', JSON.stringify(methods))
    formData.set('descuento', descuento.toString())
    formData.set('descuento_justificacion', descuentoJustificacion)

    // Extract appointment_service_ids for the RPC
    const appointmentServiceIds = pendingServiceItems
      .map(item => item.appointment_service_id)
      .filter((id): id is string => id !== null && id !== undefined)
    formData.set('appointment_service_ids', JSON.stringify(appointmentServiceIds))

    formAction(formData)
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Patient selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Paciente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* Selected patient display */}
            {patientId && selectedPatient && (
              <div className="flex items-center justify-between rounded-md border bg-gray-50 px-3 py-2">
                <span className="text-sm font-medium">{selectedPatientName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPatientId('')
                    setPatientSearch('')
                  }}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                  disabled={isPending}
                >
                  Cambiar
                </button>
              </div>
            )}

            {/* Search input */}
            {(!patientId || patientSearch) && (
              <div className="relative">
                <Input
                  placeholder="Buscar paciente por nombre o cedula..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full"
                  autoComplete="off"
                  disabled={isPending}
                />

                {/* Results dropdown */}
                {patientSearch.length >= 2 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-[200px] overflow-y-auto">
                    {filteredPatients.length === 0 ? (
                      <div className="p-3 text-center text-sm text-muted-foreground">
                        No se encontraron pacientes
                      </div>
                    ) : (
                      filteredPatients.slice(0, 20).map((patient) => (
                        <button
                          key={patient.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b last:border-b-0"
                          onClick={() => {
                            setPatientId(patient.id)
                            setPatientSearch('')
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
          {state?.errors?.patient_id && (
            <p className="text-sm text-red-500 mt-1">{state.errors.patient_id[0]}</p>
          )}
        </CardContent>
      </Card>

      {/* Pending services from appointments */}
      {patientId && (
        isLoadingPending ? (
          <Card>
            <CardContent className="py-6 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-muted-foreground">Cargando servicios pendientes...</span>
            </CardContent>
          </Card>
        ) : pendingServicesGroups.length > 0 ? (
          <PendingServicesSelector
            groups={pendingServicesGroups}
            selectedItems={pendingServiceItems}
            onChange={setPendingServiceItems}
            disabled={isPending}
          />
        ) : null
      )}

      {/* Direct services from catalog */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {pendingServicesGroups.length > 0 ? 'Servicios Adicionales' : 'Servicios'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceSelector
            services={services}
            items={directItems}
            onChange={setDirectItems}
            disabled={isPending}
          />
          {state?.errors?.items && (
            <p className="text-sm text-red-500 mt-2">{state.errors.items[0]}</p>
          )}
        </CardContent>
      </Card>

      {/* Descuento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Descuento (opcional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="descuento">Monto del descuento</Label>
              <Input
                id="descuento"
                type="number"
                value={descuento}
                onChange={e => setDescuento(parseFloat(e.target.value) || 0)}
                disabled={isPending}
                min={0}
                max={subtotal}
              />
            </div>
          </div>
          {descuento > 0 && (
            <div className="space-y-2">
              <Label htmlFor="descuento_justificacion" className="after:content-['*'] after:ml-0.5 after:text-red-500">
                Justificacion del descuento
              </Label>
              <Textarea
                id="descuento_justificacion"
                value={descuentoJustificacion}
                onChange={e => setDescuentoJustificacion(e.target.value)}
                disabled={isPending}
                placeholder="Explique la razon del descuento (minimo 5 caracteres)"
                rows={2}
              />
              {descuentoJustificacion.length < 5 && descuentoJustificacion.length > 0 && (
                <p className="text-sm text-amber-600">Minimo 5 caracteres</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Metodos de Pago</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentMethodForm
            methods={methods}
            onChange={setMethods}
            totalRequired={total}
            disabled={isPending}
          />
          {state?.errors?.methods && (
            <p className="text-sm text-red-500 mt-2">{state.errors.methods[0]}</p>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {allItems.length > 0 && (
        <PaymentSummary
          items={allItems}
          methods={methods}
          descuento={descuento}
          descuentoJustificacion={descuentoJustificacion || null}
        />
      )}

      {/* Submit */}
      <div className="flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || !canSubmit}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Registrar Pago
        </Button>
      </div>

      {/* Global error */}
      {state?.error && !state.errors && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

    </form>
  )
}
