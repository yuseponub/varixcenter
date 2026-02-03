import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMedicalRecordById, getQuotationByMedicalRecord, getProgressNotes } from '@/lib/queries/medical-records'
import { getLegacyPhotosByType } from '@/lib/queries/legacy-photos'
import { getActiveServices } from '@/lib/queries/services'
import { ArrowLeft, Pencil, Camera } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MEDICAL_RECORD_STATUS_LABELS, MEDICAL_RECORD_STATUS_VARIANTS } from '@/types'
import { RecordTabs } from '@/components/medical-records/record-tabs'
import { DiagramPageClient } from './diagram-page-client'
import type { TreatmentItem } from '@/components/medical-records/treatment-selector'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function DiagramaPage({ params }: PageProps) {
  const { id } = await params

  // Get user role
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let userRole: 'admin' | 'medico' | 'enfermera' = 'enfermera'

  if (user) {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()
    userRole = (roleData?.role as 'admin' | 'medico' | 'enfermera') || 'enfermera'
  }

  const [record, services, quotation, evolutionPhotos, progressNotes] = await Promise.all([
    getMedicalRecordById(id),
    getActiveServices(),
    getQuotationByMedicalRecord(id),
    getLegacyPhotosByType(id, 'evolucion'),
    getProgressNotes(id),
  ])

  if (!record) {
    notFound()
  }

  // Map services to simple format for treatment selector
  const treatmentOptions = services.map(s => ({
    id: s.id,
    nombre: s.nombre,
  }))

  // Convert quotation items to TreatmentItem format for the selector
  const initialTreatmentItems: TreatmentItem[] = quotation?.items?.map(item => ({
    id: item.id || crypto.randomUUID(),
    service_id: item.service_id,
    service_nombre: item.nombre,
    cantidad: item.cantidad,
    nota: item.nota || '',
    zona: item.zona || 'pierna_derecha',
  })) || []

  // Get saved audios (cast as any since field may not be in types yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialAudios = ((record as any).audios as { path: string; timestamp: string; transcription?: string }[]) || []

  return (
    <div className="container mx-auto py-6 space-y-6">
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
            <Pencil className="h-6 w-6" />
            Diagnostico y Evolucion
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

      {/* All content in client component with collapsible sections */}
      <DiagramPageClient
        medicalRecordId={id}
        initialDiagramData={record.diagrama_piernas}
        initialDiagnostico={record.diagnostico}
        initialTreatmentItems={initialTreatmentItems}
        initialAudios={initialAudios}
        treatmentOptions={treatmentOptions}
        evolutionPhotos={evolutionPhotos}
        progressNotes={progressNotes}
        isReadOnly={record.estado === 'completado'}
        userRole={userRole}
      />
    </div>
  )
}
