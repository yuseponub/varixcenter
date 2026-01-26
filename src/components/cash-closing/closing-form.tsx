'use client'

import { useActionState, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { ClosingSummaryCard } from './closing-summary-card'
import { CierrePhotoUpload } from './cierre-photo-upload'
import { closeCash, type CashClosingActionState } from '@/app/(protected)/cierres/actions'
import type { ClosingSummary } from '@/types'

interface ClosingFormProps {
  fecha: string
  summary: ClosingSummary
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

export function ClosingForm({ fecha, summary }: ClosingFormProps) {
  const router = useRouter()
  const [conteoFisico, setConteoFisico] = useState<string>(summary.total_efectivo.toString())
  const [diferencia, setDiferencia] = useState<number>(0)
  const [justificacion, setJustificacion] = useState('')
  const [notas, setNotas] = useState('')
  const [photoPath, setPhotoPath] = useState<string | null>(null)

  const [state, formAction, isPending] = useActionState<CashClosingActionState | null, FormData>(
    closeCash,
    null
  )

  // Calculate difference whenever conteo changes
  useEffect(() => {
    const conteoNum = parseFloat(conteoFisico) || 0
    setDiferencia(conteoNum - summary.total_efectivo)
  }, [conteoFisico, summary.total_efectivo])

  // Handle success/error
  useEffect(() => {
    if (state?.success && state.data) {
      toast.success(`Cierre ${(state.data as { cierre_numero: string }).cierre_numero} creado exitosamente`)
      router.push('/cierres')
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, router])

  const handleSubmit = useCallback((formData: FormData) => {
    formData.set('fecha', fecha)
    formData.set('conteo_fisico', conteoFisico)
    formData.set('diferencia_justificacion', justificacion)
    formData.set('cierre_photo_path', photoPath || '')
    formData.set('notas', notas)
    formAction(formData)
  }, [fecha, conteoFisico, justificacion, photoPath, notas, formAction])

  const hasDiferencia = diferencia !== 0
  const needsJustificacion = hasDiferencia && justificacion.trim().length < 10
  const isValid = !needsJustificacion

  // Check if already closed
  if (summary.has_existing_closing) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Ya existe un cierre</AlertTitle>
        <AlertDescription>
          Ya existe un cierre para esta fecha.{' '}
          <a href={`/cierres/${summary.existing_closing_id}`} className="underline">
            Ver cierre existente
          </a>
        </AlertDescription>
      </Alert>
    )
  }

  // Check if no payments
  if (summary.payment_count === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Sin pagos</AlertTitle>
        <AlertDescription>
          No hay pagos registrados para esta fecha. No es necesario realizar un cierre.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Summary Card */}
      <ClosingSummaryCard
        summary={summary}
        conteoFisico={parseFloat(conteoFisico) || 0}
      />

      {/* Conteo Fisico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conteo Fisico de Efectivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="conteo_fisico" className="after:content-['*'] after:ml-0.5 after:text-red-500">
              Total en efectivo contado
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                id="conteo_fisico"
                type="number"
                min="0"
                step="0.01"
                value={conteoFisico}
                onChange={(e) => setConteoFisico(e.target.value)}
                placeholder="0"
                disabled={isPending}
                className="max-w-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Ingrese el total de efectivo contado fisicamente en caja
            </p>
          </div>

          {/* Difference display */}
          <div className={`p-4 rounded-lg ${hasDiferencia ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex items-center gap-2">
              {hasDiferencia ? (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              <span className={`font-medium ${hasDiferencia ? 'text-red-700' : 'text-green-700'}`}>
                Diferencia: {formatCurrency(diferencia)}
              </span>
            </div>
            {hasDiferencia && (
              <p className="text-sm text-red-600 mt-1">
                Hay una diferencia de {formatCurrency(diferencia)}. Debe justificar esta diferencia.
              </p>
            )}
          </div>

          {/* Justificacion (required if diferencia != 0) */}
          {hasDiferencia && (
            <div className="space-y-2">
              <Label htmlFor="justificacion" className="after:content-['*'] after:ml-0.5 after:text-red-500">
                Justificacion de la diferencia
              </Label>
              <Textarea
                id="justificacion"
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                placeholder="Explique la razon de la diferencia entre el conteo y el total calculado (minimo 10 caracteres)"
                rows={3}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                {justificacion.length}/10 caracteres minimos
              </p>
              {state?.errors?.diferencia_justificacion && (
                <p className="text-sm text-red-500">{state.errors.diferencia_justificacion[0]}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Upload (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Foto del Reporte Firmado (opcional)</CardTitle>
        </CardHeader>
        <CardContent>
          <CierrePhotoUpload
            fecha={fecha}
            onUploadComplete={(path) => setPhotoPath(path)}
            onRemove={() => setPhotoPath(null)}
            disabled={isPending}
            error={state?.errors?.cierre_photo_path?.[0]}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Opcionalmente puede subir una foto del reporte impreso firmado.
          </p>
        </CardContent>
      </Card>

      {/* Notes (optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notas (opcional)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas adicionales sobre el cierre del dia..."
            rows={2}
            disabled={isPending}
          />
        </CardContent>
      </Card>

      {/* Error display */}
      {state?.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isPending || !isValid}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Cerrar Caja
        </Button>
      </div>
    </form>
  )
}
