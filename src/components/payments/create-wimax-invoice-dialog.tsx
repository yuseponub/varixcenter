'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Download,
  FileCheck2,
  FilePlus2,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  autorizarFacturaWimaxAction,
  prepararFacturaWimaxAction,
  registrarCufeFacturaWimaxAction,
} from '@/app/(protected)/pagos/actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  adjustWimaxItemsToTotal,
  defaultWimaxItems,
  isWimaxReference,
  WIMAX_CATALOG,
  type WimaxInvoiceItemInput,
} from '@/lib/wimax/catalog'
import type { PaymentWithDetails } from '@/types/payments'
import type { WimaxExecutionMode } from '@/types/invoicing'

interface CreateWimaxInvoiceDialogProps {
  payment: PaymentWithDetails
  canManage: boolean
  autoRefresh?: boolean
}

const POLLED_JOB_STATES = new Set([
  'en_cola',
  'preparando',
  'aprobada',
  'verificando',
])

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 2,
})

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    en_cola: 'En cola',
    preparando: 'Preparando',
    esperando_aprobacion: 'Esperando aprobación',
    aprobada: 'Autorizada',
    verificando: 'Verificando DIAN',
    completada: 'Facturada',
    bloqueada_duplicado: 'Bloqueada',
    emitida_sin_cufe: 'Falta CUFE',
    requiere_revision: 'Requiere revisión',
    error: 'Error',
    cancelada: 'Cancelada',
  }
  return labels[status] ?? status
}

function jobStatusLabel(job: NonNullable<PaymentWithDetails['wimax_invoice_jobs']>): string {
  if (job.estado === 'en_cola') {
    if (job.modo_ejecucion === 'urgente') return 'Esperando PC'
    if (job.modo_ejecucion === 'cierre') return 'Programada al cierre'
  }
  return statusLabel(job.estado)
}

function ApprovalDialog({ payment }: { payment: PaymentWithDetails }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const job = payment.wimax_invoice_jobs
  if (!job) return null
  const jobId = job.id
  const jobAmount = job.monto

  function approve() {
    startTransition(async () => {
      const result = await autorizarFacturaWimaxAction(jobId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Emisión autorizada. El robot verificará FE y CUFE.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="bg-[oklch(0.68_0.14_80)] text-white hover:bg-[oklch(0.6_0.13_78)]">
          <ShieldCheck />
          Autorizar emisión
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Autorizar emisión DIAN</DialogTitle>
          <DialogDescription>
            El robot ya dejó la factura preparada en WiMAX. Esta autorización
            permite aceptar el asiento contable y transmitirla a la DIAN.
          </DialogDescription>
        </DialogHeader>
        <Alert className="border-warning-foreground/40 bg-warning text-warning-foreground">
          <AlertTriangle />
          <AlertTitle>Acción irreversible</AlertTitle>
          <AlertDescription>
            Revise en el PC de contabilidad el paciente, los tratamientos y el
            total de {currencyFormatter.format(jobAmount)} antes de continuar.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Seguir revisando
            </Button>
          </DialogClose>
          <Button type="button" onClick={approve} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            Sí, emitir factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CufeDialog({ payment }: { payment: PaymentWithDetails }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cufe, setCufe] = useState('')
  const [isPending, startTransition] = useTransition()
  const job = payment.wimax_invoice_jobs
  if (!job) return null
  const jobId = job.id

  const normalized = cufe.trim().toLowerCase()
  const isValid = /^[0-9a-f]{64,128}$/.test(normalized)

  function save() {
    startTransition(async () => {
      const result = await registrarCufeFacturaWimaxAction(jobId, normalized)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('CUFE registrado y pago marcado como facturado.')
      setOpen(false)
      setCufe('')
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="border-warning-foreground/60 text-warning-foreground">
          <AlertTriangle />
          Registrar CUFE
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Completar factura {job.wimax_factura_numero}</DialogTitle>
          <DialogDescription>
            WiMAX creó la FE, pero todavía no fue posible verificar el CUFE en
            el DBF ni en ColFact. El robot seguirá consultando el portal sin
            volver a emitir; también puede copiarlo manualmente para cerrar el trabajo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`cufe-${job.id}`}>CUFE</Label>
          <Input
            id={`cufe-${job.id}`}
            value={cufe}
            onChange={(event) => setCufe(event.target.value.replace(/\s/g, ''))}
            placeholder="64 a 128 caracteres hexadecimales"
            className="font-mono text-xs"
            disabled={isPending}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>Cancelar</Button>
          </DialogClose>
          <Button type="button" onClick={save} disabled={isPending || !isValid}>
            {isPending && <Loader2 className="animate-spin" />}
            Confirmar CUFE
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BlockedDialog({ payment }: { payment: PaymentWithDetails }) {
  const job = payment.wimax_invoice_jobs
  if (!job) return null

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="border-warning-foreground/60 text-warning-foreground">
          <AlertTriangle />
          {statusLabel(job.estado)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Factura detenida por seguridad</DialogTitle>
          <DialogDescription>
            El robot no enviará nada a la DIAN hasta resolver esta revisión.
          </DialogDescription>
        </DialogHeader>
        <Alert className="border-warning-foreground/40 bg-warning text-warning-foreground">
          <AlertTriangle />
          <AlertTitle>{statusLabel(job.estado)}</AlertTitle>
          <AlertDescription>
            {job.error_message ??
              'Se encontró al menos una factura reciente para la misma cédula en WiMAX.'}
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button asChild variant="outline">
            <Link href="/facturacion">Abrir cola de facturación</Link>
          </Button>
          <DialogClose asChild>
            <Button type="button">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CreateWimaxInvoiceDialog({
  payment,
  canManage,
  autoRefresh = true,
}: CreateWimaxInvoiceDialogProps) {
  const router = useRouter()
  const job = payment.wimax_invoice_jobs
  const invoicing = payment.payment_invoicing
  const electronicInvoiceAmount = payment.payment_methods
    .filter((method) => ['tarjeta', 'transferencia'].includes(method.metodo))
    .reduce((sum, method) => sum + method.monto, 0)
  const hasInvoicePaymentMethod = electronicInvoiceAmount > 0
  const isEligible = payment.estado === 'activo' &&
    (hasInvoicePaymentMethod || Boolean(invoicing?.pidio_factura))
  const suggestedAmount = electronicInvoiceAmount > 0
    ? electronicInvoiceAmount
    : payment.total
  const initialTargetAmount = invoicing?.monto_a_facturar ?? suggestedAmount
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<WimaxInvoiceItemInput[]>(() =>
    defaultWimaxItems(payment.payment_items, initialTargetAmount)
  )
  const [targetAmount, setTargetAmount] = useState(initialTargetAmount)
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!autoRefresh || !job || !POLLED_JOB_STATES.has(job.estado)) return
    const interval = window.setInterval(() => router.refresh(), 5_000)
    return () => window.clearInterval(interval)
  }, [autoRefresh, job, router])

  useEffect(() => {
    if (open) {
      const target = invoicing?.monto_a_facturar ?? suggestedAmount
      setTargetAmount(target)
      setItems(defaultWimaxItems(payment.payment_items, target))
      setConfirming(false)
    }
  }, [open, invoicing?.monto_a_facturar, payment.payment_items, payment.total, suggestedAmount])

  const invoiceTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0),
    [items]
  )
  const difference = Math.round((invoiceTotal - targetAmount) * 100) / 100
  const validTargetAmount =
    Number.isFinite(targetAmount) &&
    targetAmount > 0 &&
    targetAmount <= payment.total
  const hasUnknown = items.some((item) => !item.referencia)
  const validItems =
    items.length > 0 &&
    items.every(
      (item) =>
        isWimaxReference(item.referencia) &&
        Number.isInteger(item.cantidad) &&
        item.cantidad > 0 &&
        Number.isFinite(item.precio_unitario) &&
        item.precio_unitario > 0
    )
  const canSubmit = validItems && validTargetAmount && Math.abs(difference) < 0.01

  if (!isEligible || !invoicing) return null

  if (invoicing.estado === 'facturada_total' || invoicing.estado === 'facturada_parcial') {
    const pdfAvailable = Boolean(invoicing.wimax_facturas?.pdf_storage_path)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-success text-success-foreground">
          <FileCheck2 />
          {invoicing.wimax_factura_numero ?? 'Facturada'}
        </Badge>
        {pdfAvailable && invoicing.wimax_factura_numero && (
          <Button asChild type="button" size="sm" variant="outline">
            <a
              href={`/api/wimax-facturas/${encodeURIComponent(invoicing.wimax_factura_numero)}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Download />
              PDF
            </a>
          </Button>
        )}
        {!pdfAvailable && invoicing.colfact_revision_estado === 'coincidencia_ambigua' && (
          <Badge className="bg-warning text-warning-foreground">
            Revisar ColFact
          </Badge>
        )}
      </div>
    )
  }
  if (invoicing.estado === 'descartada') {
    return <Badge variant="secondary">Factura descartada</Badge>
  }

  if (!canManage) {
    return <Badge variant="secondary">{job ? jobStatusLabel(job) : 'Pendiente FE'}</Badge>
  }

  if (job?.estado === 'esperando_aprobacion') return <ApprovalDialog payment={payment} />
  if (job?.estado === 'emitida_sin_cufe') return <CufeDialog payment={payment} />
  if (job?.estado === 'completada') {
    return <Badge className="bg-success text-success-foreground">{job.wimax_factura_numero}</Badge>
  }
  if (job && ['bloqueada_duplicado', 'requiere_revision'].includes(job.estado)) {
    return <BlockedDialog payment={payment} />
  }
  if (job && ['en_cola', 'preparando', 'aprobada', 'verificando'].includes(job.estado)) {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        {['preparando', 'verificando'].includes(job.estado) && <Loader2 className="animate-spin" />}
        {jobStatusLabel(job)}
      </Button>
    )
  }

  function updateItem(index: number, changes: Partial<WimaxInvoiceItemInput>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item
      )
    )
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        referencia: '',
        cantidad: 1,
        precio_unitario: 0,
        sourceItemId: globalThis.crypto?.randomUUID?.() ?? `new-${Date.now()}`,
      },
    ])
  }

  function enqueue(modoEjecucion: Extract<WimaxExecutionMode, 'urgente' | 'cierre'>) {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await prepararFacturaWimaxAction(
        payment.id,
        items.map((item) => ({
          referencia: item.referencia,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
        })),
        modoEjecucion
      )
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (result.estado === 'bloqueada_duplicado') {
        toast.warning('Factura detenida: existen FE recientes para esta cédula.')
      } else {
        toast.success(
          modoEjecucion === 'urgente'
            ? 'Factura urgente enviada. El PC pedirá permiso para usar la pantalla.'
            : 'Factura autorizada y programada para el cierre de jornada.'
        )
      }
      setOpen(false)
      router.refresh()
    })
  }

  function adjustToTarget() {
    setItems((current) => adjustWimaxItemsToTotal(current, targetAmount))
  }

  const isPartial = validTargetAmount && targetAmount < payment.total

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setConfirming(false)
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={job?.estado === 'error' ? 'outline' : 'default'}>
          <FilePlus2 />
          {job?.estado === 'error' ? 'Reintentar factura' : 'Crear factura'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear factura electrónica en WiMAX</DialogTitle>
          <DialogDescription>
            {payment.patients.nombre} {payment.patients.apellido} · pago{' '}
            {payment.numero_factura}. Escoja el monto, confirme los tratamientos
            y revise todo una segunda vez antes de enviarlo al robot.
          </DialogDescription>
        </DialogHeader>

        {!confirming && job?.estado === 'error' && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>El intento anterior falló antes de emitir</AlertTitle>
            <AlertDescription>{job.error_message ?? 'Revise los datos y reintente.'}</AlertDescription>
          </Alert>
        )}

        {!confirming && hasUnknown && (
          <Alert className="border-warning-foreground/40 bg-warning text-warning-foreground">
            <AlertTriangle />
            <AlertTitle>Falta mapear un tratamiento</AlertTitle>
            <AlertDescription>
              Seleccione la referencia WiMAX correcta en las filas marcadas.
            </AlertDescription>
          </Alert>
        )}

        {!confirming && invoicing.colfact_revision_estado === 'coincidencia_ambigua' && (
          <Alert className="border-warning-foreground/40 bg-warning text-warning-foreground">
            <AlertTriangle />
            <AlertTitle>ColFact encontró facturas que requieren revisión</AlertTitle>
            <AlertDescription>
              No emita todavía. Existe al menos una FE reciente para esta cédula,
              pero el valor o la asignación entre pagos no es único. El robot la
              bloqueará antes de tocar WiMAX para evitar un duplicado.
            </AlertDescription>
          </Alert>
        )}

        {!confirming && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
            <Label htmlFor={`wimax-target-${payment.id}`}>Monto a facturar en WiMAX</Label>
            <Input
              id={`wimax-target-${payment.id}`}
              type="number"
              min="0.01"
              max={payment.total}
              step="0.01"
              value={targetAmount || ''}
              onChange={(event) => setTargetAmount(Number(event.target.value))}
              disabled={isPending}
              className="text-lg font-semibold"
            />
            <p className="text-xs text-muted-foreground">
              Máximo disponible: {currencyFormatter.format(payment.total)}.
              Si factura menos, el pago quedará marcado como facturado parcial.
            </p>
            {!validTargetAmount && (
              <p className="text-xs text-destructive">
                Ingrese un monto mayor que cero y no superior al pago.
              </p>
            )}
          </div>
        )}

        {!confirming && <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.sourceItemId ?? `${index}-${item.referencia}`}
              className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_90px_150px_36px] md:items-end"
            >
              <div className="space-y-1.5">
                <Label>Tratamiento WiMAX</Label>
                <Select
                  value={item.referencia || undefined}
                  onValueChange={(value) => {
                    if (isWimaxReference(value)) updateItem(index, { referencia: value })
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger className={!item.referencia ? 'border-warning-foreground/60' : ''}>
                    <SelectValue placeholder="Seleccione tratamiento" />
                  </SelectTrigger>
                  <SelectContent>
                    {WIMAX_CATALOG.map((catalogItem) => (
                      <SelectItem key={catalogItem.reference} value={catalogItem.reference}>
                        {catalogItem.description} · {catalogItem.reference}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`wimax-qty-${payment.id}-${index}`}>Cantidad</Label>
                <Input
                  id={`wimax-qty-${payment.id}-${index}`}
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  value={item.cantidad || ''}
                  onChange={(event) =>
                    updateItem(index, { cantidad: Number(event.target.value) })
                  }
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`wimax-price-${payment.id}-${index}`}>Precio unitario</Label>
                <Input
                  id={`wimax-price-${payment.id}-${index}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={item.precio_unitario || ''}
                  onChange={(event) =>
                    updateItem(index, { precio_unitario: Number(event.target.value) })
                  }
                  disabled={isPending}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeItem(index)}
                disabled={isPending || items.length === 1}
                aria-label="Eliminar tratamiento"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={isPending}>
            <Plus />
            Agregar tratamiento
          </Button>
        </div>}

        {!confirming && <div className="rounded-lg bg-muted/50 p-4">
          <div className="flex justify-between text-sm">
            <span>Total del pago</span>
            <span>{currencyFormatter.format(payment.total)}</span>
          </div>
          <div className="mt-2 flex justify-between text-lg font-semibold">
            <span>Suma de tratamientos</span>
            <span className={Math.abs(difference) >= 0.01 ? 'text-destructive' : ''}>
              {currencyFormatter.format(invoiceTotal)}
            </span>
          </div>
          {Math.abs(difference) >= 0.01 && (
            <p className="mt-1 text-right text-xs text-destructive">
              Diferencia: {currencyFormatter.format(difference)}
            </p>
          )}
          {Math.abs(difference) >= 0.01 && validTargetAmount && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={adjustToTarget}>
              Ajustar valores al monto elegido
            </Button>
          )}
        </div>}

        {!confirming && <Alert>
          <ShieldCheck />
          <AlertTitle>Emisión protegida</AlertTitle>
          <AlertDescription>
            El robot hará deduplicación en Supabase y en los DBF antes de tocar
            WiMAX. En la revisión final podrá crearla ahora o dejarla autorizada
            para el cierre de jornada.
          </AlertDescription>
        </Alert>}

        {confirming && (
          <div className="space-y-4">
            <Alert className="border-warning-foreground/40 bg-warning text-warning-foreground">
              <AlertTriangle />
              <AlertTitle>Confirmación final</AlertTitle>
              <AlertDescription>
                Los botones siguientes constituyen la autorización final para emitir
                electrónicamente este paciente, estos tratamientos y este valor. El
                robot no permitirá cambiar el contenido después de confirmarlo.
              </AlertDescription>
            </Alert>
            <div className="rounded-lg border">
              {items.map((item, index) => {
                const catalogItem = WIMAX_CATALOG.find(
                  (candidate) => candidate.reference === item.referencia
                )
                return (
                  <div
                    key={item.sourceItemId ?? `${index}-${item.referencia}`}
                    className="flex items-start justify-between gap-4 border-b p-3 last:border-b-0"
                  >
                    <div>
                      <p className="font-medium">{catalogItem?.description ?? item.referencia}</p>
                      <p className="text-xs text-muted-foreground">{item.referencia}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p>{item.cantidad} × {currencyFormatter.format(item.precio_unitario)}</p>
                      <p className="font-semibold">
                        {currencyFormatter.format(item.cantidad * item.precio_unitario)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Total confirmado para WiMAX</p>
                  {isPartial && <Badge variant="secondary" className="mt-1">Factura parcial</Badge>}
                </div>
                <p className="text-xl font-bold">{currencyFormatter.format(targetAmount)}</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
                <ArrowLeft />
                Corregir
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => enqueue('cierre')}
                disabled={isPending || !canSubmit}
              >
                {isPending ? <Loader2 className="animate-spin" /> : <Clock3 />}
                Facturar al cierre
              </Button>
              <Button
                type="button"
                onClick={() => enqueue('urgente')}
                disabled={isPending || !canSubmit}
              >
                {isPending ? <Loader2 className="animate-spin" /> : <Zap />}
                Crear ahora
              </Button>
            </>
          ) : (
            <>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isPending}>Cancelar</Button>
              </DialogClose>
              <Button type="button" onClick={() => setConfirming(true)} disabled={isPending || !canSubmit}>
                Revisar factura
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
