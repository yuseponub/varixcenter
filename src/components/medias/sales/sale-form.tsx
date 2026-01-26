'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import { ProductSelector } from './product-selector'
import { SaleMethodForm } from './sale-method-form'
import { SaleSummary } from './sale-summary'
import { createMediasSale, type SaleActionState } from '@/app/(protected)/medias/ventas/actions'
import type { MediasProduct } from '@/types/medias/products'
import type { CartItem, MediasSaleMethodInput } from '@/types/medias/sales'

interface Patient {
  id: string
  cedula: string
  nombre: string
  apellido: string
}

interface SaleFormProps {
  products: MediasProduct[]
  staffUsers: { id: string; email: string }[]
  patients: Patient[]
}

export function SaleForm({ products, staffUsers, patients }: SaleFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<SaleActionState | null, FormData>(
    createMediasSale,
    null
  )

  // Form state
  const [cart, setCart] = useState<CartItem[]>([])
  const [methods, setMethods] = useState<MediasSaleMethodInput[]>([
    { metodo: 'efectivo', monto: 0, comprobante_path: null },
  ])
  const [patientId, setPatientId] = useState<string | null>(null)
  const [patientSearch, setPatientSearch] = useState('')
  const [receptorId, setReceptorId] = useState<string | null>(null)

  // Calculate totals
  const total = cart.reduce((sum, item) => sum + item.subtotal, 0)

  // Auto-update first method amount when cart changes
  useEffect(() => {
    if (methods.length === 1 && methods[0].monto === 0) {
      setMethods([{ ...methods[0], monto: total }])
    }
  }, [total])

  // Handle successful submission
  useEffect(() => {
    if (state?.success && state.data) {
      router.push(`/medias/ventas/${state.data.id}`)
    }
  }, [state?.success, state?.data, router])

  // Validation
  const methodsTotal = methods.reduce((sum, m) => sum + m.monto, 0)
  const hasValidTotal = Math.abs(total - methodsTotal) < 0.01
  const hasComprobantes = methods.every(
    (m) => m.metodo === 'efectivo' || m.comprobante_path
  )
  const canSubmit =
    cart.length > 0 && methods.length > 0 && hasValidTotal && hasComprobantes

  const handleSubmit = (formData: FormData) => {
    // Add cart items as JSON
    formData.set(
      'items',
      JSON.stringify(
        cart.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        }))
      )
    )

    // Add methods as JSON
    formData.set('methods', JSON.stringify(methods))

    // Add optional fields
    if (patientId) formData.set('patient_id', patientId)
    if (receptorId) formData.set('receptor_efectivo_id', receptorId)

    formAction(formData)
  }

  // Filter patients for dropdown search
  const filteredPatients = patientSearch
    ? patients.filter((p) =>
        `${p.cedula} ${p.nombre} ${p.apellido}`
          .toLowerCase()
          .includes(patientSearch.toLowerCase())
      )
    : patients

  return (
    <form action={handleSubmit} className="space-y-8">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Products and Methods */}
        <div className="lg:col-span-2 space-y-8">
          {/* Product Selection */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Productos</h2>
            <ProductSelector
              products={products}
              cart={cart}
              onChange={setCart}
              disabled={isPending}
            />
          </div>

          {/* Payment Methods */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Pago</h2>
            <SaleMethodForm
              methods={methods}
              onChange={setMethods}
              totalRequired={total}
              disabled={isPending}
            />
          </div>

          {/* Optional: Patient Link (VTA-06) */}
          <div className="space-y-2">
            <Label>Paciente (opcional)</Label>
            <Select
              value={patientId || '__none__'}
              onValueChange={(v) => setPatientId(v === '__none__' ? null : v)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar paciente (opcional)..." />
              </SelectTrigger>
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
                <SelectItem value="__none__">Sin paciente</SelectItem>
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
          </div>

          {/* Optional: Cash Receiver (VTA-08) */}
          {methods.some((m) => m.metodo === 'efectivo') && (
            <div className="space-y-2">
              <Label htmlFor="receptor">
                Quien recibio efectivo (si diferente al vendedor)
              </Label>
              <Select
                value={receptorId || '__none__'}
                onValueChange={(v) => setReceptorId(v === '__none__' ? null : v)}
                disabled={isPending}
              >
                <SelectTrigger id="receptor">
                  <SelectValue placeholder="Mismo vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Mismo vendedor</SelectItem>
                  {staffUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Right column: Summary */}
        <div>
          <SaleSummary cart={cart} methods={methods} />

          <Button
            type="submit"
            className="w-full mt-4"
            size="lg"
            disabled={!canSubmit || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              'Registrar Venta'
            )}
          </Button>

          {!canSubmit && cart.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {!hasValidTotal && 'El monto de pago debe coincidir con el total'}
              {hasValidTotal &&
                !hasComprobantes &&
                'Suba comprobante para pagos electronicos'}
            </p>
          )}
        </div>
      </div>
    </form>
  )
}
