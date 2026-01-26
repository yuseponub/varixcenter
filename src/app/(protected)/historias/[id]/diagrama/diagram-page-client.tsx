'use client'

/**
 * Diagram Page Client Component
 *
 * Handles the interactive part of the diagnosis page:
 * - Vein diagram canvas (left side)
 * - Voice dictation for diagnosis (right side)
 * - Treatment selector with quantity and notes (below dictation)
 * - Auto-save functionality
 */

import { useState, useCallback, useTransition, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { VeinDiagramCanvas } from '@/components/medical-records/vein-diagram-canvas'
import { VoiceDictation } from '@/components/medical-records/voice-dictation'
import { TreatmentSelector, type TreatmentItem } from '@/components/medical-records/treatment-selector'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Pencil } from 'lucide-react'
import { updateDiagramAndDiagnosis, updateTreatments, addAudioRecording } from './actions'

interface TreatmentOption {
  id: string
  nombre: string
}

interface AudioRecording {
  path: string
  timestamp: string
  transcription?: string
}

interface DiagramPageClientProps {
  medicalRecordId: string
  initialDiagramData: string | null
  initialDiagnostico: string | null
  initialTreatmentItems: TreatmentItem[]
  initialAudios: AudioRecording[]
  treatmentOptions: TreatmentOption[]
  isReadOnly: boolean
}

export function DiagramPageClient({
  medicalRecordId,
  initialDiagramData,
  initialDiagnostico,
  initialTreatmentItems,
  initialAudios,
  treatmentOptions,
  isReadOnly,
}: DiagramPageClientProps) {
  const [diagramData, setDiagramData] = useState<string | null>(initialDiagramData)
  const [diagnostico, setDiagnostico] = useState<string | null>(initialDiagnostico)
  const [treatmentItems, setTreatmentItems] = useState<TreatmentItem[]>(initialTreatmentItems)
  const [audios, setAudios] = useState<AudioRecording[]>(initialAudios)
  const [hasChanges, setHasChanges] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isSavingTreatments, setIsSavingTreatments] = useState(false)

  // Debounce timer for treatment updates
  const treatmentDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Handle diagram change
  const handleDiagramChange = useCallback((data: string) => {
    setDiagramData(data)
    setHasChanges(true)
  }, [])

  // Handle diagnosis change
  const handleDiagnosticoChange = useCallback((value: string) => {
    setDiagnostico(value)
    setHasChanges(true)
  }, [])

  // Handle audio saved
  const handleAudioSaved = useCallback(async (audio: AudioRecording) => {
    // Add to local state immediately
    setAudios(prev => [...prev, audio])

    // Save to database
    const result = await addAudioRecording(medicalRecordId, audio)
    if (!result.success) {
      toast.error('Error al guardar referencia del audio')
    }
  }, [medicalRecordId])

  // Handle treatment change with debounce
  const handleTreatmentChange = useCallback((items: TreatmentItem[]) => {
    setTreatmentItems(items)

    // Clear previous debounce
    if (treatmentDebounceRef.current) {
      clearTimeout(treatmentDebounceRef.current)
    }

    // Debounce the save to avoid too many requests
    treatmentDebounceRef.current = setTimeout(async () => {
      setIsSavingTreatments(true)
      const result = await updateTreatments(medicalRecordId, items)
      setIsSavingTreatments(false)

      if (result.success) {
        toast.success('Tratamientos actualizados')
      } else {
        toast.error(result.error || 'Error al actualizar tratamientos')
      }
    }, 800)
  }, [medicalRecordId])

  // Save diagram and diagnosis changes
  const handleSave = useCallback(() => {
    startTransition(async () => {
      const result = await updateDiagramAndDiagnosis(
        medicalRecordId,
        diagramData,
        diagnostico
      )

      if (result.success) {
        setHasChanges(false)
        setLastSaved(new Date())
        toast.success('Cambios guardados exitosamente')
      } else {
        toast.error(result.error || 'Error al guardar')
      }
    })
  }, [medicalRecordId, diagramData, diagnostico])

  return (
    <div className="space-y-6">
      {/* Save bar */}
      <div className="flex items-center justify-between p-4 bg-muted rounded-lg sticky top-0 z-10">
        <div className="text-sm text-muted-foreground">
          {hasChanges ? (
            <span className="text-amber-600 font-medium">Hay cambios sin guardar</span>
          ) : lastSaved ? (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Guardado a las {lastSaved.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : (
            <span>Sin cambios</span>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={isPending || !hasChanges || isReadOnly}
        >
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar Cambios
        </Button>
      </div>

      {/* Read-only warning */}
      {isReadOnly && (
        <Alert>
          <AlertDescription>
            Esta historia clinica esta completada y no se puede editar.
          </AlertDescription>
        </Alert>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Vein Diagram */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Diagrama de Piernas
            </CardTitle>
            <CardDescription>
              Marque las zonas afectadas por varices en el diagrama
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VeinDiagramCanvas
              initialData={diagramData}
              onChange={handleDiagramChange}
              disabled={isReadOnly}
              width={550}
              height={700}
            />
          </CardContent>
        </Card>

        {/* Right: Voice Dictation + Treatment Selector */}
        <div className="space-y-6">
          <VoiceDictation
            value={diagnostico}
            onChange={handleDiagnosticoChange}
            medicalRecordId={medicalRecordId}
            savedAudios={audios}
            onAudioSaved={handleAudioSaved}
            disabled={isReadOnly}
          />

          <TreatmentSelector
            items={treatmentItems}
            services={treatmentOptions}
            onChange={handleTreatmentChange}
            disabled={isReadOnly}
            isSaving={isSavingTreatments}
          />
        </div>
      </div>
    </div>
  )
}
