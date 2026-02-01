'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react'
import { LegacyPhotoCapture, LegacyPhotosGallery } from '@/components/medical-records'
import type { LegacyHistoryPhotoWithUrl, LegacyPhotoType, MedicalRecordWithDetails } from '@/types'
import { LEGACY_PHOTO_TYPES } from '@/types'

interface HistoriaAntiguaClientProps {
  medicalRecordId: string
  initialRecord: MedicalRecordWithDetails
  initialPhotos: LegacyHistoryPhotoWithUrl[]
}

export function HistoriaAntiguaClient({
  medicalRecordId,
  initialRecord,
  initialPhotos,
}: HistoriaAntiguaClientProps) {
  const router = useRouter()
  const [photos, setPhotos] = useState<LegacyHistoryPhotoWithUrl[]>(initialPhotos)
  const [activeCapture, setActiveCapture] = useState<LegacyPhotoType | null>(null)

  // Refresh the page to get updated photos from server
  const refreshPhotos = useCallback(() => {
    router.refresh()
    setActiveCapture(null)
  }, [router])

  // Group photos by type
  const photosByType = LEGACY_PHOTO_TYPES.reduce((acc, tipo) => {
    acc[tipo] = photos.filter(p => p.tipo === tipo)
    return acc
  }, {} as Record<LegacyPhotoType, LegacyHistoryPhotoWithUrl[]>)

  // Check if has any digital data (diagnostico, tratamientos, etc)
  const hasDigitalData = initialRecord && (
    initialRecord.diagnostico ||
    (initialRecord.treatments && initialRecord.treatments.length > 0) ||
    initialRecord.ceap_pierna_izquierda ||
    initialRecord.ceap_pierna_derecha
  )

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      {/* Header */}
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
          Historia Antigua
        </h1>
        <p className="text-muted-foreground">
          {initialRecord.patient?.nombre} {initialRecord.patient?.apellido} - CC: {initialRecord.patient?.cedula}
        </p>
      </div>

      {/* Link to digital data if exists */}
      {hasDigitalData && (
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Esta historia tambien tiene datos digitales registrados.</span>
            <Link href={`/historias/${medicalRecordId}/ver-digital`}>
              <Button variant="link" className="p-0 h-auto">
                Ver datos digitales
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      {/* Photo sections */}
      <div className="space-y-6">
        {LEGACY_PHOTO_TYPES.map((tipo) => (
          <div key={tipo}>
            {activeCapture === tipo ? (
              <LegacyPhotoCapture
                medicalRecordId={medicalRecordId}
                tipo={tipo}
                existingPhotos={photosByType[tipo]}
                onPhotoAdded={refreshPhotos}
                onPhotoDeleted={refreshPhotos}
              />
            ) : (
              <LegacyPhotosGallery
                tipo={tipo}
                photos={photosByType[tipo]}
                onAddMore={() => setActiveCapture(tipo)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex justify-between pt-4 border-t">
        <Link href="/historias">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Historias
          </Button>
        </Link>
        <Button variant="outline" onClick={refreshPhotos}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>
    </div>
  )
}
