'use client'

/**
 * Corregir el VALOR de un pago ya registrado.
 *
 * Caso real de la clinica: se registro la consulta o el procedimiento con un
 * valor equivocado (un cero de menos, el precio de otro servicio). En vez de
 * anular y volver a cobrar, la persona corrige aqui el precio/cantidad de los
 * servicios y el total; el pago queda marcado como "Valor editado por error"
 * con su usuario, la fecha y los valores anteriores.
 *
 * Con un solo metodo de pago, el monto se ajusta solo. Con varios, la persona
 * reparte y la suma debe cuadrar. El descuento no se toca aqui.
 *
 * Permisos y bloqueos (anulado, ya facturado en WiMAX) los valida el RPC
 * corregir_valor_pago; la pagina ademas oculta/deshabilita el boton.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { correctPaymentValues } from '@/app/(protected)/pagos/actions'
import {
  buildPaymentValueCorrection,
  computeDraftSubtotal,
  draftFromPayment,
  parseMoneyInput,
  suggestedTotal,
  PAYMENT_VALUE_EDIT_MOTIVO,
  PAYMENT_VALUE_EDIT_NOTA_MAX,
  type CorrectablePayment,
  type PaymentValueDraft,
} from '@/lib/payments/payment-value-correction'
import { PAYMENT_METHOD_LABELS } from '@/types/payments'
import type { PaymentItem, PaymentMethod } from '@/types/payments'

interface EditValuesDialogProps {
  paymentId: string
  numeroFactura: string
  subtotal: number
  descuento: number
  total: number
  items: PaymentItem[]
  methods: PaymentMethod[]
  /** El dia del pago ya tiene cierre de caja cerrado: se avisa, no se bloquea. */
  diaCerrado: boolean
  /** Se deshabilita cuando el pago esta anulado o ya facturado en WiMAX. */
  disabled?: boolean
  disabledReason?: string
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function EditValuesDialog({
  paymentId,
  numeroFactura,
  subtotal,
  descuento,
  total,
  items,
  methods,
  diaCerrado,
  disabled = false,
  disabledReason,
}: EditValuesDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const payment = useMemo<CorrectablePayment>(
    () => ({
      subtotal: Number(subtotal),
      descuento: Number(descuento),
      total: Number(total),
      items: items.map((item) => ({
        id: item.id,
        service_name: item.service_name,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
      })),
      methods: methods.map((method) => ({
        id: method.id,
        metodo: method.metodo,
        monto: Number(method.monto),
        comprobante_path: method.comprobante_path,
      })),
    }),
    [subtotal, descuento, total, items, methods]
  )

  const [draft, setDraft] = useState<PaymentValueDraft>(() => draftFromPayment(payment))
  const [totalTouched, setTotalTouched] = useState(false)
  const [nota, setNota] = useState('')

  // Cada apertura parte de los valores vigentes del pago.
  useEffect(() => {
    if (open) {
      setDraft(draftFromPayment(payment))
      setTotalTouched(false)
      setNota('')
    }
  }, [open, payment])

  const draftSubtotal = useMemo(() => computeDraftSubtotal(payment, draft), [payment, draft])
  const correction = useMemo(() => buildPaymentValueCorrection(payment, draft), [payment, draft])
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(draftFromPayment(payment)),
    [payment, draft]
  )
  const singleMethod = payment.methods.length === 1

  /** Al cambiar precios o cantidades, el total sigue al subtotal - descuento
   *  mientras la persona no lo haya escrito a mano. */
  function updateItem(itemId: string, patch: { price?: string; quantity?: string }) {
    setDraft((prev) => {
      const next: PaymentValueDraft = {
        ...prev,
        itemPrices: patch.price === undefined ? prev.itemPrices : { ...prev.itemPrices, [itemId]: patch.price },
        itemQuantities:
          patch.quantity === undefined
            ? prev.itemQuantities
            : { ...prev.itemQuantities, [itemId]: patch.quantity },
      }
      if (!totalTouched) {
        const nextSubtotal = computeDraftSubtotal(payment, next)
        if (nextSubtotal !== null) {
          next.total = String(suggestedTotal(nextSubtotal, payment.descuento))
        }
      }
      return next
    })
  }

  function handleSave() {
    if (!correction.ok) {
      toast.error(correction.error)
      return
    }
    startTransition(async () => {
      const result = await correctPaymentValues({
        payment_id: paymentId,
        items: correction.payload.items,
        total: correction.payload.total,
        methods: correction.payload.methods,
        nota: nota.trim() || null,
      })
      if (result.success) {
        toast.success('Valor corregido', {
          description: `El pago quedo marcado como "${PAYMENT_VALUE_EDIT_MOTIVO}".`,
        })
        setOpen(false)
        router.refresh()
      } else {
        toast.error('Error', { description: result.error || 'No se pudo corregir el valor' })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled} title={disabledReason}>
          <Pencil className="h-4 w-4 mr-2" />
          Corregir Valor
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Corregir Valor
          </DialogTitle>
          <DialogDescription>
            Pago <span className="font-mono font-medium">{numeroFactura}</span>. Corrija el
            precio o la cantidad de los servicios y el total. El descuento no cambia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Servicios */}
          <div className="space-y-2">
            <Label>Servicios</Label>
            <div className="rounded-lg border divide-y">
              <div className="grid grid-cols-[1fr_64px_130px_auto] items-center gap-3 px-2 py-1 text-xs text-muted-foreground">
                <span>Servicio</span>
                <span>Cant.</span>
                <span>Precio unit.</span>
                <span className="text-right min-w-[90px]">Subtotal</span>
              </div>
              {payment.items.map((item) => {
                const priceRaw = draft.itemPrices[item.id] ?? ''
                const quantityRaw = draft.itemQuantities[item.id] ?? ''
                const price = parseMoneyInput(priceRaw)
                const quantity = /^\d+$/.test(quantityRaw.trim()) ? Number(quantityRaw) : null
                const lineOk = price !== null && quantity !== null
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_64px_130px_auto] items-center gap-3 p-2 text-sm"
                  >
                    <span className="truncate" title={item.service_name}>
                      {item.service_name}
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={quantityRaw}
                      onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                      disabled={isPending}
                      aria-label={`Cantidad de ${item.service_name}`}
                    />
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={priceRaw}
                      onChange={(e) => updateItem(item.id, { price: e.target.value })}
                      disabled={isPending}
                      aria-label={`Precio de ${item.service_name}`}
                    />
                    <span className="text-right text-muted-foreground whitespace-nowrap min-w-[90px]">
                      {lineOk ? formatCurrency((price ?? 0) * (quantity ?? 0)) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-sm px-1">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{draftSubtotal === null ? '—' : formatCurrency(draftSubtotal)}</span>
            </div>
            {payment.descuento > 0 && (
              <div className="flex justify-between text-sm px-1 text-warning-foreground">
                <span>Descuento (no cambia)</span>
                <span>-{formatCurrency(payment.descuento)}</span>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="space-y-1">
            <Label htmlFor="edit-payment-total">Total del pago</Label>
            <Input
              id="edit-payment-total"
              type="text"
              inputMode="decimal"
              value={draft.total}
              onChange={(e) => {
                setTotalTouched(true)
                setDraft((prev) => ({ ...prev, total: e.target.value }))
              }}
              disabled={isPending}
            />
            {singleMethod && payment.methods[0] && (
              <p className="text-xs text-muted-foreground">
                Pagado en {PAYMENT_METHOD_LABELS[payment.methods[0].metodo]}: el monto del metodo
                quedara igual al total.
              </p>
            )}
          </div>

          {/* Reparto por metodo (solo si hay varios) */}
          {!singleMethod && (
            <div className="space-y-2">
              <Label>Montos por metodo de pago</Label>
              <div className="rounded-lg border divide-y">
                {payment.methods.map((method) => (
                  <div
                    key={method.id}
                    className="grid grid-cols-[1fr_160px] items-center gap-3 p-2 text-sm"
                  >
                    <span>{PAYMENT_METHOD_LABELS[method.metodo]}</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={draft.methodAmounts[method.id] ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          methodAmounts: { ...prev.methodAmounts, [method.id]: e.target.value },
                        }))
                      }
                      disabled={isPending}
                      aria-label={`Monto en ${PAYMENT_METHOD_LABELS[method.metodo]}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                La suma de los metodos debe ser igual al total.
              </p>
            </div>
          )}

          {!correction.ok && isDirty && (
            <p className="text-xs text-destructive">{correction.error}</p>
          )}

          {/* Nota opcional */}
          <div className="space-y-1">
            <Label htmlFor="edit-payment-nota">Nota (opcional)</Label>
            <Textarea
              id="edit-payment-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value.slice(0, PAYMENT_VALUE_EDIT_NOTA_MAX))}
              placeholder="Ej: se digito 15.000 en vez de 150.000"
              disabled={isPending}
              rows={2}
            />
          </div>

          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm space-y-1">
            <p>
              El pago quedara marcado como{' '}
              <span className="font-medium">&quot;{PAYMENT_VALUE_EDIT_MOTIVO}&quot;</span> con su
              usuario, la fecha y los valores anteriores.
            </p>
            {diaCerrado && (
              <p className="text-warning-foreground">
                El dia de este pago ya tiene cierre de caja. El cierre conserva las cifras con las
                que se hizo; la correccion solo cambia el pago.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending || !correction.ok}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Pencil className="mr-2 h-4 w-4" />
                Guardar Correccion
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
