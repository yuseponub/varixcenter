'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  FileCheck2,
  FilePlus2,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
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
  defaultWimaxItems,
  isWimaxReference,
  WIMAX_CATALOG,
  type WimaxInvoiceItemInput,
} from '@/lib/wimax/catalog'
import type { PaymentWithDetails } from '@/types/payments'

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
  const isCard = payment.payment_methods.some((method) => method.metodo === 'tarjeta')
  const isEligible = payment.estado === 'activo' && (isCard || Boolean(invoicing?.pidio_factura))
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<WimaxInvoiceItemInput[]>(() =>
    defaultWimaxItems(payment.payment_items, payment.total)
  )
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!autoRefresh || !job || !POLLED_JOB_STATES.has(job.estado)) return
    const interval = window.setInterval(() => router.refresh(), 5_000)
    return () => window.clearInterval(interval)
  }, [autoRefresh, job, router])

  useEffect(() => {
    if (open) {
      setItems(defaultWimaxItems(payment.payment_items, payment.total))
    }
  }, [open, payment.payment_items, payment.total])

  const invoiceTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0),
    [items]
  )
  const difference = Math.round((invoiceTotal - payment.total) * 100) / 100
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
  const canSubmit = validItems && Math.abs(difference) < 0.01

  if (!isEligible || !invoicing) return null

  if (invoicing.estado === 'facturada_total' || invoicing.estado === 'facturada_parcial') {
    return (
      <Badge className="bg-success text-success-foreground">
        <FileCheck2 />
        {invoicing.wimax_factura_numero ?? 'Facturada'}
      </Badge>
    )
  }
  if (invoicing.estado === 'descartada') {
    return <Badge variant="secondary">Factura descartada</Badge>
  }

  if (!canManage) {
    return <Badge variant="secondary">{job ? statusLabel(job.estado) : 'Pendiente FE'}</Badge>
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
        {statusLabel(job.estado)}
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

  function enqueue() {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await prepararFacturaWimaxAction(
        payment.id,
        items.map((item) => ({
          referencia: item.referencia,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
        }))
      )
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (result.estado === 'bloqueada_duplicado') {
        toast.warning('Factura detenida: existen FE recientes para esta cédula.')
      } else {
        toast.success('Factura enviada al robot en modo supervisado.')
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            {payment.numero_factura}. Los valores son editables, pero el total
            debe coincidir con lo pagado.
          </DialogDescription>
        </DialogHeader>

        {job?.estado === 'error' && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>El intento anterior falló antes de emitir</AlertTitle>
            <AlertDescription>{job.error_message ?? 'Revise los datos y reintente.'}</AlertDescription>
          </Alert>
        )}

        {hasUnknown && (
          <Alert className="border-warning-foreground/40 bg-warning text-warning-foreground">
            <AlertTriangle />
            <AlertTitle>Falta mapear un tratamiento</AlertTitle>
            <AlertDescription>
              Seleccione la referencia WiMAX correcta en las filas marcadas.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
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
        </div>

        <div className="rounded-lg bg-muted/50 p-4">
          <div className="flex justify-between text-sm">
            <span>Total del pago</span>
            <span>{currencyFormatter.format(payment.total)}</span>
          </div>
          <div className="mt-2 flex justify-between text-lg font-semibold">
            <span>Total a facturar</span>
            <span className={Math.abs(difference) >= 0.01 ? 'text-destructive' : ''}>
              {currencyFormatter.format(invoiceTotal)}
            </span>
          </div>
          {Math.abs(difference) >= 0.01 && (
            <p className="mt-1 text-right text-xs text-destructive">
              Diferencia: {currencyFormatter.format(difference)}
            </p>
          )}
        </div>

        <Alert>
          <ShieldCheck />
          <AlertTitle>Emisión supervisada</AlertTitle>
          <AlertDescription>
            El robot hará deduplicación en Supabase y en los DBF, preparará la
            factura y se detendrá antes del paso irreversible.
          </AlertDescription>
        </Alert>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>Cancelar</Button>
          </DialogClose>
          <Button type="button" onClick={enqueue} disabled={isPending || !canSubmit}>
            {isPending && <Loader2 className="animate-spin" />}
            Enviar al robot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
