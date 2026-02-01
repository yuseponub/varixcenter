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

import { useState, useCallback, useRef } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { VeinDiagramCanvas } from '@/components/medical-records/vein-diagram-canvas'
import { VoiceDictation } from '@/components/medical-records/voice-dictation'
import { TreatmentSelector, type TreatmentItem } from '@/components/medical-records/treatment-selector'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
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
  const [hasDiagramChanges, setHasDiagramChanges] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSavingTreatments, setIsSavingTreatments] = useState(false)
  const [isSavingDiagnosis, setIsSavingDiagnosis] = useState(false)

  // Diagram collapse state
  const [isDiagramExpanded, setIsDiagramExpanded] = useState(false)
  const [hasDiagramBeenExpanded, setHasDiagramBeenExpanded] = useState(false)

  const handleDiagramToggle = useCallback(() => {
    if (!isDiagramExpanded && !hasDiagramBeenExpanded) {
      setHasDiagramBeenExpanded(true)
    }
    setIsDiagramExpanded(!isDiagramExpanded)
  }, [isDiagramExpanded, hasDiagramBeenExpanded])

  // Debounce timers
  const treatmentDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const diagnosisDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const diagramDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Handle diagram change with auto-save
  const handleDiagramChange = useCallback((data: string) => {
    setDiagramData(data)
    setHasDiagramChanges(true)

    // Clear previous debounce
    if (diagramDebounceRef.current) {
      clearTimeout(diagramDebounceRef.current)
    }

    // Debounce the save (longer delay for diagram since it changes frequently)
    diagramDebounceRef.current = setTimeout(async () => {
      const result = await updateDiagramAndDiagnosis(medicalRecordId, data, null)

      if (result.success) {
        setHasDiagramChanges(false)
        setLastSaved(new Date())
        toast.success('Diagrama guardado')
      } else {
        toast.error(result.error || 'Error al guardar diagrama')
      }
    }, 2000)
  }, [medicalRecordId])

  // Handle diagnosis change with auto-save
  const handleDiagnosticoChange = useCallback((value: string) => {
    setDiagnostico(value)

    // Clear previous debounce
    if (diagnosisDebounceRef.current) {
      clearTimeout(diagnosisDebounceRef.current)
    }

    // Debounce the save
    diagnosisDebounceRef.current = setTimeout(async () => {
      setIsSavingDiagnosis(true)
      const result = await updateDiagramAndDiagnosis(medicalRecordId, null, value)
      setIsSavingDiagnosis(false)

      if (result.success) {
        setLastSaved(new Date())
        toast.success('Diagnóstico guardado')
      } else {
        toast.error(result.error || 'Error al guardar diagnóstico')
      }
    }, 1500)
  }, [medicalRecordId])

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

  return (
    <div className="space-y-6">
      {/* Auto-save status bar */}
      <div className="flex items-center justify-center p-3 bg-muted rounded-lg sticky top-0 z-10">
        <div className="text-sm text-muted-foreground">
          {isSavingDiagnosis || hasDiagramChanges ? (
            <span className="text-blue-600 flex items-center gap-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando cambios...
            </span>
          ) : lastSaved ? (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Guardado automáticamente a las {lastSaved.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : (
            <span>Los cambios se guardan automáticamente</span>
          )}
        </div>
      </div>

      {/* Read-only warning */}
      {isReadOnly && (
        <Alert>
          <AlertDescription>
            Esta historia clinica esta completada y no se puede editar.
          </AlertDescription>
        </Alert>
      )}

      {/* Two-column layout - On mobile, diagnosis first, diagram second */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Diagnosis + Treatment (appears first on mobile) */}
        <div className="space-y-6 order-1 lg:order-2">
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

        {/* Vein Diagram (Collapsible - appears second on mobile) */}
        <div
          className={cn(
            "border rounded-lg bg-card select-none order-2 lg:order-1",
            !isDiagramExpanded && "p-4 cursor-pointer"
          )}
          onClick={!isDiagramExpanded ? handleDiagramToggle : undefined}
        >
          {!isDiagramExpanded ? (
            /* Collapsed: minimal bar */
            <div className="flex items-center gap-2 text-card-foreground">
              <ChevronRight className="h-5 w-5" />
              <Pencil className="h-5 w-5" />
              <span className="font-semibold">Diagrama de Piernas</span>
              <span className="text-xs text-muted-foreground ml-auto">
                Toque para expandir
              </span>
            </div>
          ) : (
            /* Expanded: full card */
            <Card className="border-0">
              <CardHeader
                className="cursor-pointer select-none"
                onClick={handleDiagramToggle}
              >
                <CardTitle className="text-lg flex items-center gap-2">
                  <ChevronDown className="h-5 w-5" />
                  <Pencil className="h-5 w-5" />
                  Diagrama de Piernas
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    Toque para colapsar
                  </span>
                </CardTitle>
              </CardHeader>
              {hasDiagramBeenExpanded && (
                <CardContent>
                  <VeinDiagramCanvas
                    initialData={diagramData}
                    onChange={handleDiagramChange}
                    disabled={isReadOnly}
                    width={550}
                    height={700}
                  />
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
