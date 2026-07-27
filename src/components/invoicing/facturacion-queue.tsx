'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check,
  Clipboard,
  Download,
  FileCheck2,
  FileClock,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  actualizarMontoFacturarAction,
  cruzarFacturacionAction,
  descartarFacturacionAction,
} from '@/app/(protected)/facturacion/actions'
import type {
  PendingInvoicingItem,
  RecentInvoicingItem,
} from '@/types/invoicing'

interface FacturacionQueueProps {
  pending: PendingInvoicingItem[]
  recent: RecentInvoicingItem[]
}

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Bogota',
})

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

function amountForClipboard(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

async function copyValue(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copiado`)
  } catch {
    toast.error('No fue posible copiar al portapapeles')
  }
}

function CopyField({
  label,
  value,
  displayValue,
  warning,
}: {
  label: string
  value: string
  displayValue?: string
  warning?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex min-h-9 items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
        <span
          className={`min-w-0 flex-1 break-words text-sm ${warning ? 'text-warning-foreground' : ''}`}
        >
          {displayValue ?? value}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => copyValue(label, value)}
          disabled={!value}
          aria-label={`Copiar ${label.toLowerCase()}`}
        >
          <Clipboard className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function PendingCard({ item }: { item: PendingInvoicingItem }) {
  const router = useRouter()
  const suggestedAmount = item.monto_a_facturar ?? item.payment.total
  const [amount, setAmount] = useState(suggestedAmount)
  const [savedAmount, setSavedAmount] = useState(suggestedAmount)
  const [reason, setReason] = useState('')
  const [discardOpen, setDiscardOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [isSaving, startSaving] = useTransition()
  const [isDiscarding, startDiscarding] = useTransition()

  useEffect(() => {
    const nextAmount = item.monto_a_facturar ?? item.payment.total
    setAmount(nextAmount)
    setSavedAmount(nextAmount)
  }, [item.monto_a_facturar, item.payment.total])

  if (hidden) return null

  const patientName = `${item.payment.patient.nombre} ${item.payment.patient.apellido}`.trim()
  const cedula = item.payment.patient.cedula?.trim() ?? ''
  const paymentDate = formatDate(item.payment.created_at)
  const services = item.payment.services
    .map((service) =>
      service.quantity > 1
        ? `${service.service_name} x${service.quantity}`
        : service.service_name
    )
    .join(', ')
  const daysOld = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(item.payment.created_at).getTime()) / 86_400_000
    )
  )
  const amountChanged = Math.abs(amount - savedAmount) >= 0.01
  const activeJob = item.job && [
    'en_cola',
    'preparando',
    'esperando_aprobacion',
    'aprobada',
    'verificando',
    'emitida_sin_cufe',
    'requiere_revision',
  ].includes(item.job.estado)

  function saveAmount() {
    startSaving(async () => {
      const result = await actualizarMontoFacturarAction(item.payment_id, amount)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setSavedAmount(amount)
      toast.success('Monto a facturar guardado')
      router.refresh()
    })
  }

  function discard() {
    startDiscarding(async () => {
      const result = await descartarFacturacionAction(item.payment_id, reason)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setDiscardOpen(false)
      setHidden(true)
      toast.success('Pago descartado de la cola')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{patientName}</CardTitle>
            <CardDescription>
              Pago {item.payment.numero_factura} · hace {daysOld}{' '}
              {daysOld === 1 ? 'dia' : 'dias'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {item.pidio_factura && (
              <Badge variant="secondary">La solicito</Badge>
            )}
            {item.job && (
              <Badge variant="outline">Robot: {item.job.estado.replaceAll('_', ' ')}</Badge>
            )}
            {item.colfact_revision_estado === 'sin_coincidencia' && (
              <Badge variant="outline">No encontrada en ColFact</Badge>
            )}
            {item.colfact_revision_estado === 'coincidencia_ambigua' && (
              <Badge className="bg-warning text-warning-foreground">
                Revisar coincidencia ColFact
              </Badge>
            )}
            <Badge className="bg-warning text-warning-foreground">Pendiente</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyField label="Nombre completo" value={patientName} />
          <CopyField
            label="Cedula"
            value={cedula}
            displayValue={cedula || 'Paciente sin cedula'}
            warning={!cedula}
          />
          <CopyField label="Fecha del pago" value={paymentDate} />
          <div className="space-y-1.5">
            <Label htmlFor={`amount-${item.id}`} className="text-xs text-muted-foreground">
              Monto a facturar (verificar en WiMAX)
            </Label>
            <div className="flex gap-2">
              <Input
                id={`amount-${item.id}`}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount || ''}
                onChange={(event) => setAmount(Number(event.target.value))}
                disabled={isSaving || Boolean(activeJob)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() =>
                  copyValue('Monto', amountForClipboard(amount))
                }
                disabled={!Number.isFinite(amount) || amount <= 0}
                aria-label="Copiar monto"
              >
                <Clipboard className="h-4 w-4" />
              </Button>
              {amountChanged && (
                <Button
                  type="button"
                  size="icon"
                  onClick={saveAmount}
                  disabled={
                    isSaving ||
                    Boolean(activeJob) ||
                    !Number.isFinite(amount) ||
                    amount <= 0
                  }
                  aria-label="Guardar monto a facturar"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Pago registrado: {formatCurrency(item.payment.total)}
            </p>
          </div>
        </div>

        <CopyField
          label="Servicios del pago"
          value={services}
          displayValue={services || 'Sin servicios asociados'}
          warning={!services}
        />

        <div className="flex justify-end gap-2">
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/pagos/${item.payment_id}`}>Abrir pago</Link>
          </Button>
          <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={Boolean(activeJob)}>
                <Trash2 className="h-4 w-4" />
                Descartar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Descartar pago de facturacion</DialogTitle>
                <DialogDescription>
                  El pago no volvera a aparecer como pendiente. Registre por que no
                  debe facturarse en WiMAX.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor={`discard-${item.id}`}>Motivo</Label>
                <Textarea
                  id={`discard-${item.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ej. Pago duplicado o factura no requerida"
                  rows={3}
                  disabled={isDiscarding}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isDiscarding}>
                    Cancelar
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={discard}
                  disabled={isDiscarding || reason.trim().length < 5}
                >
                  {isDiscarding && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar descarte
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}

function RecentCard({ item }: { item: RecentInvoicingItem }) {
  const patientName = `${item.payment.patient.nombre} ${item.payment.patient.apellido}`.trim()
  const invoiceAmount = item.wimax_factura?.total
  const invoiceNumber = item.wimax_factura_numero
    .toUpperCase()
    .startsWith('FE')
    ? item.wimax_factura_numero
    : `FE ${item.wimax_factura_numero}`

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{patientName}</p>
        <p className="text-sm text-muted-foreground">
          Pago {item.payment.numero_factura} · {formatDate(item.payment.created_at)}
        </p>
      </div>
      <div className="sm:text-right">
        <p className="font-mono font-semibold">{invoiceNumber}</p>
        <p className="text-sm text-muted-foreground">
          {invoiceAmount === undefined
            ? formatCurrency(item.payment.total)
            : formatCurrency(invoiceAmount)}
        </p>
      </div>
      <Badge
        className={
          item.estado === 'facturada_total'
            ? 'w-fit bg-success text-success-foreground'
            : 'w-fit bg-info text-info-foreground'
        }
      >
        {item.estado === 'facturada_total' ? 'Total' : 'Parcial'}
      </Badge>
      {item.wimax_factura?.pdf_storage_path && (
        <Button asChild size="sm" variant="outline">
          <a
            href={`/api/wimax-facturas/${encodeURIComponent(item.wimax_factura_numero)}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            <Download />
            PDF
          </a>
        </Button>
      )}
      {!item.wimax_factura?.pdf_storage_path &&
        item.colfact_revision_estado === 'sin_coincidencia' && (
          <Badge className="w-fit bg-warning text-warning-foreground">
            No encontrada en ColFact
          </Badge>
        )}
      {!item.wimax_factura?.pdf_storage_path &&
        item.colfact_revision_estado === 'coincidencia_ambigua' && (
          <Badge className="w-fit bg-warning text-warning-foreground">
            Revisar coincidencia ColFact
          </Badge>
        )}
    </div>
  )
}

export function FacturacionQueue({ pending, recent }: FacturacionQueueProps) {
  const router = useRouter()
  const [isCrossing, startCrossing] = useTransition()

  function crossNow() {
    startCrossing(async () => {
      const result = await cruzarFacturacionAction()
      if (!result.success) {
        toast.error(result.error)
        return
      }

      const totalMatches =
        result.data.facturadas_total + result.data.facturadas_parcial
      toast.success(
        totalMatches === 0
          ? `Cruce terminado: ${result.data.pendientes} pendientes sin coincidencia nueva`
          : `Cruce terminado: ${result.data.facturadas_total} totales y ${result.data.facturadas_parcial} parciales`
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-tight">
            <FileClock className="h-6 w-6" />
            Facturacion WiMAX
          </h1>
          <p className="mt-1 text-muted-foreground">
            Datos listos para digitar y verificar a ojo antes de emitir la FE.
          </p>
        </div>
        <Button type="button" onClick={crossNow} disabled={isCrossing}>
          {isCrossing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Cruzar ahora
        </Button>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Por facturar</h2>
          <Badge variant="secondary">{pending.length}</Badge>
        </div>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <Check className="mb-3 h-8 w-8 text-success-foreground" />
              <p className="font-medium">No hay pagos pendientes</p>
              <p className="text-sm text-muted-foreground">
                Los pagos con tarjeta o transferencia y las solicitudes nuevas apareceran aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pending.map((item) => (
              <PendingCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileCheck2 className="h-5 w-5" />
          Facturadas recientes
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aun no hay coincidencias recientes con el espejo de WiMAX.
          </p>
        ) : (
          <div className="space-y-3">
            {recent.map((item) => (
              <RecentCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
