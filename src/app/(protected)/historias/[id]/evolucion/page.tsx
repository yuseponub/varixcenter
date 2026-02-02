import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMedicalRecordById, getProgressNotes } from '@/lib/queries/medical-records'
import { getLegacyPhotosByType } from '@/lib/queries/legacy-photos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, TrendingUp, Camera } from 'lucide-react'
import { MEDICAL_RECORD_STATUS_LABELS, MEDICAL_RECORD_STATUS_VARIANTS } from '@/types'
import { ProgressNotes, LegacyPhotosGallery } from '@/components/medical-records'
import { RecordTabs } from '@/components/medical-records/record-tabs'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EvolucionPage({ params }: PageProps) {
  const { id } = await params
  const record = await getMedicalRecordById(id)

  if (!record) {
    notFound()
  }

  const [progressNotes, legacyPhotos] = await Promise.all([
    getProgressNotes(id),
    getLegacyPhotosByType(id, 'evolucion'),
  ])

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
            <TrendingUp className="h-6 w-6" />
            Evolucion
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
          tipo="evolucion"
          photos={legacyPhotos}
        />
      )}

      {/* Empty state for photos */}
      {legacyPhotos.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Fotos de Evolucion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6 text-muted-foreground">
              <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay fotos de evolucion</p>
              <Link href={`/historias/${id}/historia-antigua`}>
                <Button variant="link" className="mt-2">
                  Tomar fotos
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Notes */}
      <ProgressNotes
        medicalRecordId={id}
        notes={progressNotes}
      />
    </div>
  )
}
