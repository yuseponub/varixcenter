'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Printer } from 'lucide-react'
import type { CashClosing } from '@/types'

interface PaymentForPrint {
  id: string
  numero_factura: string
  total: number
  descuento: number
  estado: string
  patients: { nombre: string; apellido: string; cedula: string }
  payment_methods: { metodo: string; monto: number }[]
}

interface ClosingPrintReportProps {
  closing: CashClosing
  payments?: PaymentForPrint[]
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'full'
  }).format(new Date(dateStr + 'T12:00:00'))

export function ClosingPrintReport({ closing, payments = [] }: ClosingPrintReportProps) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const printContent = printRef.current
    if (!printContent) return

    const paymentsRows = payments.map(p => `
      <tr>
        <td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${p.numero_factura}${p.estado === 'anulado' ? ' <span style="color:red;">(ANULADO)</span>' : ''}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${p.patients.nombre} ${p.patients.apellido}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${p.patients.cedula}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(p.total)}${p.descuento > 0 ? ` <span style="color:#b45309;font-size:11px;">(-${formatCurrency(p.descuento)})</span>` : ''}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #eee;">${p.payment_methods.map(pm => `${pm.metodo}: ${formatCurrency(pm.monto)}`).join(', ')}</td>
      </tr>
    `).join('')

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cierre de Caja - ${closing.cierre_numero}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 15mm;
            max-width: 100%;
            margin: 0 auto;
            font-size: 13px;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 22px;
          }
          .header p {
            margin: 4px 0;
            color: #666;
          }
          .section {
            margin-bottom: 16px;
          }
          .section-title {
            font-weight: bold;
            margin-bottom: 8px;
            border-bottom: 1px solid #ccc;
            padding-bottom: 4px;
            font-size: 14px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
          }
          .row.total {
            font-weight: bold;
            font-size: 16px;
            border-top: 2px solid #000;
            padding-top: 8px;
            margin-top: 8px;
          }
          .row.difference {
            color: ${closing.diferencia !== 0 ? 'red' : 'green'};
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          th {
            text-align: left;
            padding: 6px 8px;
            border-bottom: 2px solid #333;
            font-size: 12px;
          }
          th.right { text-align: right; }
          .signature-section {
            margin-top: 50px;
            display: flex;
            justify-content: space-around;
          }
          .signature-line {
            width: 200px;
            text-align: center;
          }
          .signature-line hr {
            margin-bottom: 5px;
          }
          @page {
            size: A4;
            margin: 20mm 15mm;
          }
          @media print {
            body {
              padding: 0;
              margin: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>VARIX CENTER</h1>
          <h2 style="margin:4px 0;">CIERRE DE CAJA</h2>
          <p><strong>${closing.cierre_numero}</strong></p>
          <p>${formatDate(closing.fecha_cierre)}</p>
        </div>

        <div class="section">
          <div class="section-title">Totales por Metodo de Pago</div>
          <div class="row">
            <span>Efectivo</span>
            <span>${formatCurrency(closing.total_efectivo)}</span>
          </div>
          <div class="row">
            <span>Tarjeta</span>
            <span>${formatCurrency(closing.total_tarjeta)}</span>
          </div>
          <div class="row">
            <span>Transferencia</span>
            <span>${formatCurrency(closing.total_transferencia)}</span>
          </div>
          <div class="row">
            <span>Nequi</span>
            <span>${formatCurrency(closing.total_nequi)}</span>
          </div>
          <div class="row total">
            <span>TOTAL RECAUDADO</span>
            <span>${formatCurrency(closing.grand_total)}</span>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Conteo de Efectivo</div>
          <div class="row">
            <span>Conteo Fisico</span>
            <span>${formatCurrency(closing.conteo_fisico_efectivo)}</span>
          </div>
          <div class="row">
            <span>Total Calculado</span>
            <span>${formatCurrency(closing.total_efectivo)}</span>
          </div>
          <div class="row difference">
            <span>Diferencia</span>
            <span>${formatCurrency(closing.diferencia)}</span>
          </div>
          ${closing.diferencia_justificacion ? `
          <div style="margin-top: 8px; font-style: italic;">
            <strong>Justificacion:</strong> ${closing.diferencia_justificacion}
          </div>
          ` : ''}
        </div>

        ${closing.total_descuentos > 0 || closing.total_anulaciones > 0 ? `
        <div class="section">
          <div class="section-title">Descuentos y Anulaciones</div>
          ${closing.total_descuentos > 0 ? `
          <div class="row">
            <span>Total Descuentos</span>
            <span>-${formatCurrency(closing.total_descuentos)}</span>
          </div>
          ` : ''}
          ${closing.total_anulaciones > 0 ? `
          <div class="row">
            <span>Total Anulaciones</span>
            <span>${formatCurrency(closing.total_anulaciones)}</span>
          </div>
          ` : ''}
        </div>
        ` : ''}

        ${payments.length > 0 ? `
        <div class="section">
          <div class="section-title">Detalle de Pagos del Dia (${payments.length})</div>
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Paciente</th>
                <th>Cedula</th>
                <th class="right">Total</th>
                <th>Metodo</th>
              </tr>
            </thead>
            <tbody>
              ${paymentsRows}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${closing.notas ? `
        <div class="section">
          <div class="section-title">Notas</div>
          <p>${closing.notas}</p>
        </div>
        ` : ''}

        <div class="signature-section">
          <div class="signature-line">
            <hr />
            <span>Firma Responsable</span>
          </div>
          <div class="signature-line">
            <hr />
            <span>Firma Supervisor</span>
          </div>
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Reporte para Imprimir</CardTitle>
        <Button onClick={handlePrint} variant="outline" size="sm">
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
      </CardHeader>
      <CardContent>
        <div ref={printRef} className="space-y-4 text-sm">
          <div className="text-center border-b pb-4">
            <h2 className="text-lg font-bold">CIERRE DE CAJA</h2>
            <p className="font-mono">{closing.cierre_numero}</p>
            <p className="text-muted-foreground">{formatDate(closing.fecha_cierre)}</p>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Totales por Metodo</h3>
            <div className="grid grid-cols-2 gap-2">
              <span>Efectivo:</span>
              <span className="text-right">{formatCurrency(closing.total_efectivo)}</span>
              <span>Tarjeta:</span>
              <span className="text-right">{formatCurrency(closing.total_tarjeta)}</span>
              <span>Transferencia:</span>
              <span className="text-right">{formatCurrency(closing.total_transferencia)}</span>
              <span>Nequi:</span>
              <span className="text-right">{formatCurrency(closing.total_nequi)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>TOTAL:</span>
              <span>{formatCurrency(closing.grand_total)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Conteo Efectivo</h3>
            <div className="grid grid-cols-2 gap-2">
              <span>Conteo Fisico:</span>
              <span className="text-right">{formatCurrency(closing.conteo_fisico_efectivo)}</span>
              <span>Calculado:</span>
              <span className="text-right">{formatCurrency(closing.total_efectivo)}</span>
              <span className={closing.diferencia !== 0 ? 'text-red-600' : 'text-green-600'}>Diferencia:</span>
              <span className={`text-right ${closing.diferencia !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(closing.diferencia)}
              </span>
            </div>
          </div>

          {payments.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">Pagos del Dia ({payments.length})</h3>
              <div className="text-xs space-y-1">
                {payments.map(p => (
                  <div key={p.id} className="flex justify-between border-b pb-1">
                    <span>{p.patients.nombre} {p.patients.apellido}</span>
                    <span>{formatCurrency(p.total)} - {p.payment_methods.map(pm => pm.metodo).join(', ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
