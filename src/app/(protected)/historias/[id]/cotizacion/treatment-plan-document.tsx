'use client'

/**
 * Treatment Plan Document Component
 *
 * Renders the treatment plan document similar to the physical VARIXCENTER form.
 * Includes: header, diagnosis, lab exams, therapeutic procedures by zone,
 * sclerotherapy treatments, supplies, and totals.
 */

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Printer, Download } from 'lucide-react'
import type { Quotation, QuotationItem, BodyZone } from '@/types'

// Zone labels
const ZONE_LABELS: Record<BodyZone, string> = {
  pierna_derecha: 'Miembro Inferior Derecho',
  pierna_izquierda: 'Miembro Inferior Izquierdo',
  mano_derecha: 'Mano Derecha',
  mano_izquierda: 'Mano Izquierda',
  cara: 'Cara',
}

// Zone short labels for tables
const ZONE_SHORT_LABELS: Record<BodyZone, string> = {
  pierna_derecha: 'MID',
  pierna_izquierda: 'MII',
  mano_derecha: 'M.Der',
  mano_izquierda: 'M.Izq',
  cara: 'Cara',
}

interface TreatmentPlanDocumentProps {
  patientName: string
  patientAge: number | null
  patientCedula: string
  doctorName: string
  diagnostico: string | null
  quotation: Quotation | null
  serviceInfo: Map<string, { nombre: string; categoria: string; precio: number }>
  createdAt: string
}

// Format currency
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)

// Format date
const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

export function TreatmentPlanDocument({
  patientName,
  patientAge,
  patientCedula,
  doctorName,
  diagnostico,
  quotation,
  serviceInfo,
  createdAt,
}: TreatmentPlanDocumentProps) {
  // Group items by zone
  const itemsByZone = new Map<BodyZone, QuotationItem[]>()
  const items = quotation?.items || []

  items.forEach(item => {
    const zona = item.zona || 'pierna_derecha'
    if (!itemsByZone.has(zona)) {
      itemsByZone.set(zona, [])
    }
    itemsByZone.get(zona)!.push(item)
  })

  // Get unique zones in order
  const zones = Array.from(itemsByZone.keys()).sort((a, b) => {
    const order: BodyZone[] = ['pierna_derecha', 'pierna_izquierda', 'mano_derecha', 'mano_izquierda', 'cara']
    return order.indexOf(a) - order.indexOf(b)
  })

  // Calculate totals by zone
  const totalsByZone = new Map<BodyZone, number>()
  zones.forEach(zona => {
    const zoneItems = itemsByZone.get(zona) || []
    const total = zoneItems.reduce((sum, item) => sum + (item.subtotal || item.precio * item.cantidad), 0)
    totalsByZone.set(zona, total)
  })

  // Grand total
  const grandTotal = quotation?.total || Array.from(totalsByZone.values()).reduce((a, b) => a + b, 0)

  const handlePrint = () => {
    // Build procedure tables HTML
    let proceduresHtml = ''
    if (items.length > 0) {
      zones.forEach(zona => {
        const zoneItems = itemsByZone.get(zona) || []
        const zoneTotal = totalsByZone.get(zona) || 0
        const rows = zoneItems.map(item => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px dashed #ccc;">${item.nombre}</td>
            <td style="padding:6px 8px;border-bottom:1px dashed #ccc;text-align:center;">${item.cantidad}</td>
            <td style="padding:6px 8px;border-bottom:1px dashed #ccc;color:#666;">${item.nota || '-'}</td>
            <td style="padding:6px 8px;border-bottom:1px dashed #ccc;text-align:right;font-weight:500;">${formatCurrency(item.subtotal || item.precio * item.cantidad)}</td>
          </tr>
        `).join('')

        proceduresHtml += `
          <div style="margin-bottom:20px;">
            <h3 style="font-size:13px;font-weight:600;background:#f3f4f6;padding:8px;border-radius:4px;margin:0 0 8px 0;">
              PROCEDIMIENTOS - ${ZONE_LABELS[zona]}
            </h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="border-bottom:2px solid #333;">
                  <th style="text-align:left;padding:6px 8px;">Procedimiento</th>
                  <th style="text-align:center;padding:6px 8px;width:60px;">Cant.</th>
                  <th style="text-align:left;padding:6px 8px;">Observaciones</th>
                  <th style="text-align:right;padding:6px 8px;width:120px;">Valor</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="3" style="padding:6px 8px;text-align:right;font-weight:600;">Subtotal ${ZONE_SHORT_LABELS[zona]}:</td>
                  <td style="padding:6px 8px;text-align:right;font-weight:600;">${formatCurrency(zoneTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        `
      })

      proceduresHtml += `
        <hr style="margin:16px 0;" />
        <div style="text-align:right;">
          <div style="display:inline-block;background:#f3f4f6;padding:12px 20px;border-radius:4px;">
            <strong style="font-size:16px;">TOTAL COSTOS: ${formatCurrency(grandTotal)}</strong>
          </div>
        </div>
      `
    } else {
      proceduresHtml = '<p style="text-align:center;color:#666;padding:30px 0;">No hay procedimientos registrados en el programa terapeutico.</p>'
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Plan de Tratamiento - ${patientName}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 0;
            max-width: 100%;
            margin: 0 auto;
            font-size: 13px;
            color: #000;
          }
          @page {
            size: A4;
            margin: 20mm;
          }
        </style>
      </head>
      <body>
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="margin:0;font-size:22px;">VARIXCENTER</h1>
          <p style="margin:4px 0;color:#666;font-size:13px;">Centro Medico Flebologico</p>
          <p style="margin:2px 0;color:#666;font-size:11px;">Cra 34 #52-125 Piso 2</p>
        </div>

        <hr style="margin:16px 0;" />

        <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
          <div>
            <p style="margin:4px 0;"><strong>FECHA:</strong> ${formatDate(createdAt)}</p>
            <p style="margin:4px 0;"><strong>NOMBRE DEL PACIENTE:</strong> ${patientName}</p>
            <p style="margin:4px 0;"><strong>NOMBRE DEL MEDICO:</strong> ${doctorName}</p>
          </div>
          <div style="text-align:right;">
            <p style="margin:4px 0;"><strong>EDAD:</strong> ${patientAge ?? '-'} a\u00f1os</p>
            <p style="margin:4px 0;"><strong>CC:</strong> ${patientCedula}</p>
          </div>
        </div>

        ${diagnostico ? `
        <div style="margin-bottom:20px;">
          <p style="font-weight:600;margin:0 0 4px 0;">DIAGNOSTICO:</p>
          <p style="margin:0;white-space:pre-wrap;">${diagnostico}</p>
        </div>
        <hr style="margin:16px 0;" />
        ` : ''}

        <div style="border:1px solid #ccc;padding:12px;border-radius:4px;margin-bottom:20px;">
          <p style="font-weight:600;margin:0 0 4px 0;">COSTOS DE PROCEDIMIENTOS</p>
          <p style="font-size:11px;color:#666;margin:0;">
            <strong>LEA CUIDADOSAMENTE:</strong> Recuerde que todo procedimiento requiere cita previa.
            Este plan de costos tiene validez de 6 meses. Cualquier duda gustosamente le atenderemos.
          </p>
        </div>

        ${proceduresHtml}

        <hr style="margin:24px 0 12px 0;" />
        <div style="font-size:11px;color:#666;">
          <p style="font-weight:600;margin:0 0 4px 0;">*Nota importante:</p>
          <p style="margin:0;">
            Generalmente despues de realizados los procedimientos de Cirugia, Laser Endovascular o
            Eco-reabsorcion Guia Duplex, se debe realizar el tratamiento Flebologico para las varices
            pequenas y vasitos (Laser Superficial, Escleroterapia). Cuando al paciente se le realiza
            cirugia, Laser Endovascular o Eco-reabsorcion Guia Duplex, debe asistir a un control anual
            en el cual se le realiza un escaneo venoso Duplex de las zonas tratadas anteriormente.
          </p>
        </div>

        <div style="margin-top:30px;padding-top:12px;border-top:1px solid #ccc;text-align:center;font-size:11px;color:#666;">
          <p>Documento generado el ${formatDate(new Date().toISOString())}</p>
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  const handleDownloadPDF = handlePrint

  // Check if there are any items
  const hasItems = items.length > 0

  return (
    <div className="space-y-4">
      {/* Action buttons - hidden when printing */}
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
        <Button onClick={handleDownloadPDF}>
          <Download className="h-4 w-4 mr-2" />
          Descargar PDF
        </Button>
      </div>

      {/* Document */}
      <Card id="treatment-plan-print" className="print:shadow-none print:border-none">
        <CardContent className="p-6">
          {/* Header with logo */}
          <div className="text-center mb-6 print:mb-4">
            <h1 className="text-[22px] font-bold text-primary print:text-black">VARIXCENTER</h1>
            <p className="text-sm text-muted-foreground">Centro Medico Flebologico</p>
            <p className="text-xs text-muted-foreground">Cra 34 #52-125 Piso 2</p>
          </div>

          <Separator className="my-4" />

          {/* Patient and doctor info */}
          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div className="space-y-1">
              <p><span className="font-semibold">FECHA:</span> {formatDate(createdAt)}</p>
              <p><span className="font-semibold">NOMBRE DEL PACIENTE:</span> {patientName}</p>
              <p><span className="font-semibold">NOMBRE DEL MEDICO:</span> {doctorName}</p>
            </div>
            <div className="space-y-1 text-right">
              <p><span className="font-semibold">EDAD:</span> {patientAge ?? '-'} años</p>
              <p><span className="font-semibold">CC:</span> {patientCedula}</p>
            </div>
          </div>

          {/* Diagnosis */}
          {diagnostico && (
            <div className="mb-6">
              <p className="font-semibold text-sm mb-1">DIAGNOSTICO:</p>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded print:bg-transparent print:p-0">
                {diagnostico}
              </p>
            </div>
          )}

          <Separator className="my-4" />

          {/* Cost notice */}
          <div className="bg-muted/30 p-3 rounded text-sm mb-6 print:bg-transparent print:border print:border-gray-300">
            <p className="font-semibold">COSTOS DE PROCEDIMIENTOS</p>
            <p className="text-xs text-muted-foreground mt-1">
              <strong>LEA CUIDADOSAMENTE:</strong> Recuerde que todo procedimiento requiere cita previa.
              Este plan de costos tiene validez de 6 meses. Cualquier duda gustosamente le atenderemos.
            </p>
          </div>

          {!hasItems ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No hay procedimientos registrados en el programa terapeutico.</p>
              <p className="text-sm mt-2">Agregue procedimientos desde la seccion &quot;Dx y Evolucion&quot;.</p>
            </div>
          ) : (
            <>
              {/* Procedures by zone */}
              {zones.map(zona => {
                const zoneItems = itemsByZone.get(zona) || []
                const zoneTotal = totalsByZone.get(zona) || 0

                return (
                  <div key={zona} className="mb-6">
                    <h3 className="font-semibold text-sm bg-primary/10 p-2 rounded print:bg-gray-100">
                      PROCEDIMIENTOS - {ZONE_LABELS[zona]}
                    </h3>
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Procedimiento</th>
                          <th className="text-center py-2 font-medium w-20">Cant.</th>
                          <th className="text-left py-2 font-medium">Observaciones</th>
                          <th className="text-right py-2 font-medium w-32">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zoneItems.map((item, idx) => (
                          <tr key={item.id || idx} className="border-b border-dashed">
                            <td className="py-2">{item.nombre}</td>
                            <td className="py-2 text-center">{item.cantidad}</td>
                            <td className="py-2 text-muted-foreground">{item.nota || '-'}</td>
                            <td className="py-2 text-right font-medium">
                              {formatCurrency(item.subtotal || item.precio * item.cantidad)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold">
                          <td colSpan={3} className="py-2 text-right">
                            Subtotal {ZONE_SHORT_LABELS[zona]}:
                          </td>
                          <td className="py-2 text-right">{formatCurrency(zoneTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })}

              {/* Grand Total */}
              <Separator className="my-4" />
              <div className="flex justify-end">
                <div className="bg-primary/10 p-4 rounded print:bg-gray-100">
                  <p className="text-lg font-bold">
                    TOTAL COSTOS: {formatCurrency(grandTotal)}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Important note */}
          <Separator className="my-6" />
          <div className="text-xs text-muted-foreground">
            <p className="font-semibold mb-1">*Nota importante:</p>
            <p>
              Generalmente despues de realizados los procedimientos de Cirugia, Laser Endovascular o
              Eco-reabsorcion Guia Duplex, se debe realizar el tratamiento Flebologico para las varices
              pequenas y vasitos (Laser Superficial, Escleroterapia). Cuando al paciente se le realiza
              cirugia, Laser Endovascular o Eco-reabsorcion Guia Duplex, debe asistir a un control anual
              en el cual se le realiza un escaneo venoso Duplex de las zonas tratadas anteriormente.
            </p>
          </div>

          {/* Footer with date */}
          <div className="mt-8 pt-4 border-t text-xs text-muted-foreground text-center">
            <p>Documento generado el {formatDate(new Date().toISOString())}</p>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
