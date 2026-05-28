import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { splitMethodAmounts, isMixedPayment } from '@/types'

export interface DayPayment {
  id: string
  numero_factura: string
  total: number
  descuento: number
  estado: string
  nota?: string | null
  patients: { nombre: string; apellido: string; cedula: string }
  payment_methods: { metodo: string; monto: number }[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

const amountCell = (amount: number) =>
  amount > 0 ? formatCurrency(amount) : <span className="text-muted-foreground">—</span>

export function PaymentsBreakdownTable({ payments }: { payments: DayPayment[] }) {
  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay pagos registrados para este dia</p>
  }

  // Column totals exclude anulados so they tie out to the closing totals.
  const totals = payments.reduce(
    (acc, p) => {
      if (p.estado === 'anulado') return acc
      const split = splitMethodAmounts(p.payment_methods)
      acc.efectivo += split.efectivo
      acc.tarjeta += split.tarjeta
      acc.otros += split.otros
      return acc
    },
    { efectivo: 0, tarjeta: 0, otros: 0 }
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 font-medium">Factura</th>
            <th className="text-left py-2 font-medium">Paciente</th>
            <th className="text-right py-2 font-medium">Total</th>
            <th className="text-right py-2 font-medium">Efectivo</th>
            <th className="text-right py-2 font-medium">Tarjeta</th>
            <th className="text-right py-2 font-medium">Otros</th>
            <th className="text-left py-2 font-medium">Notas</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => {
            const anulado = payment.estado === 'anulado'
            const split = anulado
              ? { efectivo: 0, tarjeta: 0, otros: 0 }
              : splitMethodAmounts(payment.payment_methods)
            const mixto = !anulado && isMixedPayment(payment.payment_methods)
            return (
              <tr key={payment.id} className="border-b last:border-0">
                <td className="py-2">
                  <Link
                    href={`/pagos/${payment.id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {payment.numero_factura}
                  </Link>
                  {mixto && (
                    <Badge variant="secondary" className="ml-2 text-xs">Mixto</Badge>
                  )}
                  {anulado && (
                    <Badge variant="destructive" className="ml-2 text-xs">Anulado</Badge>
                  )}
                </td>
                <td className="py-2">
                  {payment.patients.nombre} {payment.patients.apellido}
                </td>
                <td className={`py-2 text-right font-medium ${anulado ? 'text-muted-foreground line-through' : ''}`}>
                  {formatCurrency(payment.total)}
                  {payment.descuento > 0 && (
                    <span className="text-xs text-amber-600 ml-1">
                      (-{formatCurrency(payment.descuento)})
                    </span>
                  )}
                </td>
                <td className="py-2 text-right">{amountCell(split.efectivo)}</td>
                <td className="py-2 text-right">{amountCell(split.tarjeta)}</td>
                <td className="py-2 text-right">{amountCell(split.otros)}</td>
                <td className="py-2 text-muted-foreground">
                  {payment.nota ? (
                    <span className="block max-w-[220px] truncate" title={payment.nota}>
                      {payment.nota}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-medium">
            <td className="py-2" colSpan={3}>Totales</td>
            <td className="py-2 text-right">{formatCurrency(totals.efectivo)}</td>
            <td className="py-2 text-right">{formatCurrency(totals.tarjeta)}</td>
            <td className="py-2 text-right">{formatCurrency(totals.otros)}</td>
            <td className="py-2"></td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        Otros agrupa transferencia y nequi. Los pagos anulados no suman en los totales.
      </p>
    </div>
  )
}
