'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, FileText, RefreshCw, Save, Loader2, Stethoscope } from 'lucide-react'
import { LegacyPhotoCapture, LegacyPhotosGallery } from '@/components/medical-records'
import { toast } from 'sonner'
import type { LegacyHistoryPhotoWithUrl, LegacyPhotoType, MedicalRecordWithDetails } from '@/types'
import { LEGACY_PHOTO_TYPES } from '@/types'
import { addProcedimientoDelDia } from './actions'

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

  // Procedimiento del día state
  const [procedimientoDelDia, setProcedimientoDelDia] = useState('')
  const [isSavingProcedimiento, setIsSavingProcedimiento] = useState(false)

  // Try to lock screen orientation to portrait
  useEffect(() => {
    const lockOrientation = async () => {
      try {
        // Try to lock orientation (works on some mobile browsers)
        if (screen.orientation && 'lock' in screen.orientation) {
          await (screen.orientation as any).lock('portrait')
        }
      } catch (err) {
        // Orientation lock not supported or not allowed - that's ok
        console.log('Orientation lock not available')
      }
    }

    lockOrientation()

    // Cleanup - unlock when leaving the page
    return () => {
      try {
        if (screen.orientation && 'unlock' in screen.orientation) {
          (screen.orientation as any).unlock()
        }
      } catch {
        // Ignore errors on cleanup
      }
    }
  }, [])

  // Refresh the page to get updated photos from server
  const refreshPhotos = useCallback(() => {
    router.refresh()
    setActiveCapture(null)
  }, [router])

  // Save procedimiento del día as progress note
  const handleSaveProcedimiento = useCallback(async () => {
    if (!procedimientoDelDia.trim()) {
      toast.error('Ingrese el procedimiento del día')
      return
    }

    setIsSavingProcedimiento(true)
    const result = await addProcedimientoDelDia(medicalRecordId, procedimientoDelDia.trim())
    setIsSavingProcedimiento(false)

    if (result.success) {
      toast.success('Procedimiento del día guardado')
      setProcedimientoDelDia('')
      router.refresh()
    } else {
      toast.error(result.error || 'Error al guardar')
    }
  }, [medicalRecordId, procedimientoDelDia, router])

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

            {/* Procedimiento del día - después de Evolución */}
            {tipo === 'evolucion' && (
              <Card className="mt-4">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />
                    Procedimiento del Dia
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="procedimiento" className="text-sm text-muted-foreground">
                        Ingrese el procedimiento que se realizara hoy (se guardara en Notas de Evolucion)
                      </Label>
                      <Input
                        id="procedimiento"
                        value={procedimientoDelDia}
                        onChange={(e) => setProcedimientoDelDia(e.target.value)}
                        placeholder="Ej: Escleroterapia pierna derecha, Laser endovascular..."
                        className="mt-1"
                      />
                    </div>
                    <Button
                      onClick={handleSaveProcedimiento}
                      disabled={isSavingProcedimiento || !procedimientoDelDia.trim()}
                      size="sm"
                    >
                      {isSavingProcedimiento ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Guardar Procedimiento
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
