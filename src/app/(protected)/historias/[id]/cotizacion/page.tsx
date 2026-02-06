import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getMedicalRecordById,
  getQuotationByMedicalRecord,
} from '@/lib/queries/medical-records'
import { getLegacyPhotosByType } from '@/lib/queries/legacy-photos'
import { getActiveServices } from '@/lib/queries/services'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, FileText, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LegacyPhotosGallery } from '@/components/medical-records'
import { RecordTabs } from '@/components/medical-records/record-tabs'
import { MEDICAL_RECORD_STATUS_LABELS, MEDICAL_RECORD_STATUS_VARIANTS } from '@/types'
import { TreatmentPlanDocument } from './treatment-plan-document'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PlanTratamientoPage({ params }: PageProps) {
  const { id } = await params

  // Get medical record with patient data
  const [record, quotation, legacyPhotos, services] = await Promise.all([
    getMedicalRecordById(id),
    getQuotationByMedicalRecord(id),
    getLegacyPhotosByType(id, 'plan_tratamiento'),
    getActiveServices(),
  ])

  if (!record) {
    notFound()
  }

  // Calculate patient age
  let patientAge: number | null = null
  if (record.patient?.fecha_nacimiento) {
    const birthDate = new Date(record.patient.fecha_nacimiento)
    const today = new Date()
    patientAge = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      patientAge--
    }
  }

  // Get doctor name from the assigned doctor in the medical record
  let doctorName = 'Dr.'
  if (record.doctor) {
    if (record.doctor.nombre || record.doctor.apellido) {
      doctorName = `Dr. ${record.doctor.nombre || ''} ${record.doctor.apellido || ''}`.trim()
    }
  }

  // Create service info map (id -> {nombre, categoria, precio})
  const serviceInfo = new Map<string, { nombre: string; categoria: string; precio: number }>()
  services.forEach(s => {
    serviceInfo.set(s.id, {
      nombre: s.nombre,
      categoria: (s as { categoria?: string }).categoria || 'procedimiento',
      precio: s.precio_base,
    })
  })

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between print:hidden">
        <div>
          <Link
            href="/historias"
            className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Historias
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <FileText className="h-6 w-6" />
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
      <div className="print:hidden">
        <RecordTabs recordId={id} isReadOnly={record.estado === 'completado'} />
      </div>

      {/* Legacy Photos Section */}
      {legacyPhotos.length > 0 && (
        <div className="print:hidden">
          <LegacyPhotosGallery
            tipo="plan_tratamiento"
            photos={legacyPhotos}
          />
        </div>
      )}

      {/* Treatment Plan Document */}
      <TreatmentPlanDocument
        patientName={`${record.patient?.nombre || ''} ${record.patient?.apellido || ''}`.trim()}
        patientAge={patientAge}
        patientCedula={record.patient?.cedula || ''}
        doctorName={doctorName}
        diagnostico={record.diagnostico}
        quotation={quotation}
        serviceInfo={serviceInfo}
        createdAt={quotation?.updated_at || record.created_at}
      />
    </div>
  )
}
