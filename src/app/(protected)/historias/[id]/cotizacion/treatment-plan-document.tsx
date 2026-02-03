'use client'

/**
 * Treatment Plan Document Component
 *
 * Renders the treatment plan document similar to the physical VARIXCENTER form.
 * Includes: header, diagnosis, lab exams, therapeutic procedures by zone,
 * sclerotherapy treatments, supplies, and totals.
 */

import { useRef } from 'react'
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
  const documentRef = useRef<HTMLDivElement>(null)

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

  // Handle print
  const handlePrint = () => {
    window.print()
  }

  // Handle PDF download (uses print dialog with PDF option)
  const handleDownloadPDF = () => {
    window.print()
  }

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
      <Card className="print:shadow-none print:border-none">
        <CardContent className="p-6 print:p-0" ref={documentRef}>
          {/* Header with logo */}
          <div className="text-center mb-6 print:mb-4">
            <h1 className="text-2xl font-bold text-primary print:text-black">VARIXCENTER</h1>
            <p className="text-sm text-muted-foreground">Centro Medico Flebologico</p>
            <p className="text-xs text-muted-foreground">Cra. 34 N 53-125 Piso 2</p>
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

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          #__next {
            visibility: visible;
          }
          #__next > * {
            visibility: visible;
          }
          [class*="CardContent"] {
            visibility: visible;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          [class*="CardContent"] * {
            visibility: visible;
          }
        }
      `}</style>
    </div>
  )
}
