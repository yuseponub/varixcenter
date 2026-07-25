'use client'

/**
 * Corregir el METODO de pago de un pago ya registrado.
 *
 * Caso real de la clinica: se registro como efectivo pero el paciente pago con
 * tarjeta (o al reves). El monto TOTAL del pago no cambia — solo COMO se pago.
 * El pago nunca se borra: esa restriccion (anulacion, solo admin/medico) sigue.
 *
 * Permisos: admin, medico y secretaria (validado en el RPC editar_metodos_pago).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { editPaymentMethods } from '@/app/(protected)/pagos/actions'
import { PAYMENT_METHOD_LABELS, type PaymentMethodType } from '@/types/payments'

interface ExistingMethod {
  id: string
  metodo: PaymentMethodType
  monto: number
  comprobante_path: string | null
}

interface EditMethodsDialogProps {
  paymentId: string
  total: number
  methods: ExistingMethod[]
  /** Se oculta cuando el pago esta anulado o ya facturado en WiMAX. */
  disabled?: boolean
  disabledReason?: string
}

interface Row {
  metodo: PaymentMethodType
  monto: string
  comprobante_path: string | null
}

const METHOD_OPTIONS: PaymentMethodType[] = [
  'efectivo',
  'tarjeta',
  'transferencia',
  'nequi',
]

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function EditMethodsDialog({
  paymentId,
  total,
  methods,
  disabled = false,
  disabledReason,
}: EditMethodsDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<Row[]>(() =>
    methods.map((m) => ({
      metodo: m.metodo,
      monto: String(m.monto),
      comprobante_path: m.comprobante_path,
    }))
  )

  // Al abrir, refrescar desde los metodos actuales del pago.
  function handleOpenChange(next: boolean) {
    if (next) {
      setRows(
        methods.map((m) => ({
          metodo: m.metodo,
          monto: String(m.monto),
          comprobante_path: m.comprobante_path,
        }))
      )
    }
    setOpen(next)
  }

  const suma = rows.reduce((acc, r) => acc + (parseFloat(r.monto) || 0), 0)
  const cuadra = Math.round(suma * 100) === Math.round(total * 100)

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    // El nuevo metodo arranca con lo que falte para cuadrar el total.
    const faltante = Math.max(0, total - suma)
    setRows((prev) => [
      ...prev,
      { metodo: 'efectivo', monto: faltante ? String(faltante) : '', comprobante_path: null },
    ])
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function handleSave() {
    if (!cuadra) {
      toast.error('La suma de los métodos debe ser igual al total del pago')
      return
    }
    startTransition(async () => {
      const result = await editPaymentMethods({
        payment_id: paymentId,
        methods: rows.map((r) => ({
          metodo: r.metodo,
          monto: parseFloat(r.monto) || 0,
          comprobante_path: r.comprobante_path,
        })),
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Método de pago actualizado')
      setOpen(false)
      router.refresh()
    })
  }

  if (disabled) {
    return disabledReason ? (
      <span className="text-xs text-muted-foreground">{disabledReason}</span>
    ) : null
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Editar método
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corregir método de pago</DialogTitle>
          <DialogDescription>
            Cambia cómo se pagó. El total del pago ({formatCurrency(total)}) no se
            modifica y el pago no se elimina.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                {i === 0 && <Label className="text-xs">Método</Label>}
                <Select
                  value={row.metodo}
                  onValueChange={(v) => updateRow(i, { metodo: v as PaymentMethodType })}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32 space-y-1">
                {i === 0 && <Label className="text-xs">Monto</Label>}
                <Input
                  type="number"
                  value={row.monto}
                  onChange={(e) => updateRow(i, { monto: e.target.value })}
                  disabled={isPending}
                  className="text-right"
                  min={0}
                  step="any"
                />
              </div>
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(i)}
                  disabled={isPending}
                  className="h-9 w-9 shrink-0 text-destructive"
                  title="Quitar método"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            disabled={isPending}
            className="text-muted-foreground"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Dividir en otro método
          </Button>

          {/* Control de cuadre */}
          <div
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
              cuadra
                ? 'bg-success text-success-foreground'
                : 'bg-destructive-soft text-destructive'
            }`}
          >
            <span>Suma de métodos</span>
            <span className="font-semibold">
              {formatCurrency(suma)}
              {!cuadra && ` / ${formatCurrency(total)}`}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending || !cuadra}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
