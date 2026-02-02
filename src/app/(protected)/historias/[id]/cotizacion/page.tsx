import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getMedicalRecordById,
  getQuotationByMedicalRecord,
} from '@/lib/queries/medical-records'
import { getLegacyPhotosByType } from '@/lib/queries/legacy-photos'
import { generateQuotationFromTreatments } from '@/app/(protected)/historias/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, User, ClipboardList, Camera } from 'lucide-react'
import { QuotationPanel, LegacyPhotosGallery } from '@/components/medical-records'
import { RecordTabs } from '@/components/medical-records/record-tabs'
import { MEDICAL_RECORD_STATUS_LABELS, MEDICAL_RECORD_STATUS_VARIANTS } from '@/types'
import type { QuotationItem } from '@/types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PlanTratamientoPage({ params }: PageProps) {
  const { id } = await params
  const record = await getMedicalRecordById(id)

  if (!record) {
    notFound()
  }

  // Get existing quotation if any
  const existingQuotation = await getQuotationByMedicalRecord(id)

  // Get legacy photos
  const legacyPhotos = await getLegacyPhotosByType(id, 'plan_tratamiento')

  // Generate quotation items from treatments if no existing quotation
  let quotationItems: QuotationItem[] = []

  if (existingQuotation) {
    quotationItems = existingQuotation.items
  } else if (record.tratamiento_ids && record.tratamiento_ids.length > 0) {
    const result = await generateQuotationFromTreatments(id, record.tratamiento_ids)
    if ('items' in result) {
      quotationItems = result.items
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/historias"
            className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Historias
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <ClipboardList className="h-6 w-6" />
            Plan de Tratamiento
            <Badge variant={MEDICAL_RECORD_STATUS_VARIANTS[record.estado]}>
              {MEDICAL_RECORD_STATUS_LABELS[record.estado]}
            </Badge>
          </h1>
          <p className="text-muted-foreground">
            {record.patient?.nombre} {record.patient?.apellido} - CC: {record.patient?.cedula}
          </p>
        </div>
        <Link href={`/historias/${id}/historia-antigua`}>
          <Button variant="outline">
            <Camera className="mr-2 h-4 w-4" />
            Gestionar Fotos
          </Button>
        </Link>
      </div>

      {/* Navigation Tabs */}
      <RecordTabs recordId={id} isReadOnly={record.estado === 'completado'} />

      {/* Legacy Photos Section */}
      {legacyPhotos.length > 0 && (
        <LegacyPhotosGallery
          tipo="plan_tratamiento"
          photos={legacyPhotos}
        />
      )}

      {/* Patient Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Paciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {record.patient ? (
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">
                  {record.patient.nombre} {record.patient.apellido}
                </p>
                <p className="text-sm text-muted-foreground">
                  CC: {record.patient.cedula}
                </p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>Fecha cita: {record.appointment ? formatDate(record.appointment.fecha_hora_inicio) : '-'}</p>
                <p>Historia creada: {formatDate(record.created_at)}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Paciente no encontrado</p>
          )}
        </CardContent>
      </Card>

      {/* Quotation Panel */}
      <QuotationPanel
        medicalRecordId={id}
        items={quotationItems}
        existingQuotation={existingQuotation}
      />

      {/* Print-only patient info */}
      <div className="hidden print:block mt-8 pt-8 border-t">
        <p className="text-sm text-muted-foreground">
          Plan de tratamiento generado por Varix Clinic - {formatDate(new Date().toISOString())}
        </p>
      </div>
    </div>
  )
}
