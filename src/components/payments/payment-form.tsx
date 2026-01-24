'use client'

import { useActionState, useState, useEffect } from 'react'
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
import { createPayment, type PaymentActionState } from '@/app/(protected)/pagos/actions'
import type { ServiceOption } from '@/types/services'
import type { PaymentItemInput, PaymentMethodInput } from '@/types/payments'
import { requiresComprobante } from '@/types/payments'

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
}

/**
 * Complete payment form component
 *
 * Composes ServiceSelector, PaymentMethodForm, and PaymentSummary.
 * Handles discount with justification requirement.
 * Validates all fields before enabling submit.
 * Auto-updates first method amount when items change.
 * Redirects to detail page on success.
 */
export function PaymentForm({ services, patients, defaultPatientId }: PaymentFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<PaymentActionState | null, FormData>(
    createPayment,
    null
  )

  // Form state
  const [patientId, setPatientId] = useState(defaultPatientId || '')
  const [items, setItems] = useState<PaymentItemInput[]>([])
  const [methods, setMethods] = useState<PaymentMethodInput[]>([{
    metodo: 'efectivo',
    monto: 0,
    comprobante_path: null
  }])
  const [descuento, setDescuento] = useState(0)
  const [descuentoJustificacion, setDescuentoJustificacion] = useState('')

  // Calculated values
  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const total = subtotal - descuento
  const methodsTotal = methods.reduce((sum, m) => sum + m.monto, 0)
  const isBalanced = Math.abs(total - methodsTotal) < 0.01

  // Update first method amount when items change (if only one method with zero amount)
  useEffect(() => {
    if (methods.length === 1 && methods[0].monto === 0 && total > 0) {
      setMethods([{ ...methods[0], monto: total }])
    }
  }, [total, methods])

  // Handle success/error
  useEffect(() => {
    if (state?.success && state.data) {
      toast.success(`Pago registrado: ${state.data.numero_factura}`)
      router.push(`/pagos/${state.data.id}`)
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, router])

  // Validation
  const canSubmit =
    patientId &&
    items.length > 0 &&
    methods.length > 0 &&
    isBalanced &&
    (descuento === 0 || descuentoJustificacion.length >= 5) &&
    methods.every(m => m.metodo === 'efectivo' || m.comprobante_path)

  const handleSubmit = (formData: FormData) => {
    // Add JSON data to form
    formData.set('patient_id', patientId)
    formData.set('items', JSON.stringify(items))
    formData.set('methods', JSON.stringify(methods))
    formData.set('descuento', descuento.toString())
    formData.set('descuento_justificacion', descuentoJustificacion)

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
          <Select value={patientId} onValueChange={setPatientId} disabled={isPending}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar paciente..." />
            </SelectTrigger>
            <SelectContent>
              {patients.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.cedula} - {p.nombre} {p.apellido}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state?.errors?.patient_id && (
            <p className="text-sm text-red-500 mt-1">{state.errors.patient_id[0]}</p>
          )}
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Servicios</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceSelector
            services={services}
            items={items}
            onChange={setItems}
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
                value={descuento || ''}
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
      {items.length > 0 && (
        <PaymentSummary
          items={items}
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
