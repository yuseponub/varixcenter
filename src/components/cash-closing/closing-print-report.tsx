'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Printer } from 'lucide-react'
import type { CashClosing } from '@/types'

interface ClosingPrintReportProps {
  closing: CashClosing
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'full'
  }).format(new Date(dateStr + 'T12:00:00'))

export function ClosingPrintReport({ closing }: ClosingPrintReportProps) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const printContent = printRef.current
    if (!printContent) return

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
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .header p {
            margin: 5px 0;
            color: #666;
          }
          .section {
            margin-bottom: 20px;
          }
          .section-title {
            font-weight: bold;
            margin-bottom: 10px;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
          }
          .row.total {
            font-weight: bold;
            font-size: 18px;
            border-top: 2px solid #000;
            padding-top: 10px;
            margin-top: 10px;
          }
          .row.difference {
            color: ${closing.diferencia !== 0 ? 'red' : 'green'};
          }
          .signature-section {
            margin-top: 60px;
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
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>CIERRE DE CAJA</h1>
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
          <div style="margin-top: 10px; font-style: italic;">
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

        ${closing.notas ? `
        <div class="section">
          <div class="section-title">Notas</div>
          <p>${closing.notas}</p>
        </div>
        ` : ''}

        <div class="signature-section">
          <div class="signature-line">
            <hr />
            <span>Firma Secretaria</span>
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
        </div>
      </CardContent>
    </Card>
  )
}
