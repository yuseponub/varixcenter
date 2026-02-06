'use client'

/**
 * Diagnosis & Evolution Page Client Component
 *
 * Sections in order:
 * 1. Photos (evolution) - collapsed if empty
 * 2. Voice Dictation - minimal recorder with destination choice
 * 3. Diagnosis - text area
 * 4. Progress Notes - notes list
 * 5. Leg Diagram - vein diagram
 * 6. Treatment Program - treatment selector
 *
 * All sections: collapsed if empty, open if has content
 */

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, CheckCircle2, Camera, Mic, FileText, ScrollText, Pencil, Briefcase, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { VoiceRecorder } from '@/components/medical-records/voice-recorder'
import { VeinDiagramCanvas } from '@/components/medical-records/vein-diagram-canvas'
import { TreatmentSelector, type TreatmentItem } from '@/components/medical-records/treatment-selector'
import { LegacyPhotosGallery } from '@/components/medical-records'
import { updateDiagramAndDiagnosis, updateTreatments, addAudioRecording, addProgressNoteFromDictation, deleteProgressNote, updateProgramaTerapeuticoTexto } from './actions'
import type { LegacyHistoryPhotoWithUrl, ProgressNoteWithDetails } from '@/types'

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
  initialProgramaTexto: string
  initialTreatmentItems: TreatmentItem[]
  initialAudios: AudioRecording[]
  treatmentOptions: TreatmentOption[]
  evolutionPhotos: LegacyHistoryPhotoWithUrl[]
  progressNotes: ProgressNoteWithDetails[]
  isReadOnly: boolean
  userRole: 'admin' | 'medico' | 'enfermera'
}

export function DiagramPageClient({
  medicalRecordId,
  initialDiagramData,
  initialDiagnostico,
  initialProgramaTexto,
  initialTreatmentItems,
  initialAudios,
  treatmentOptions,
  evolutionPhotos,
  progressNotes: initialProgressNotes,
  isReadOnly,
  userRole,
}: DiagramPageClientProps) {
  const canEditDiagnosis = ['admin', 'medico'].includes(userRole)
  // State
  const [diagramData, setDiagramData] = useState<string | null>(initialDiagramData)
  const [diagnostico, setDiagnostico] = useState<string>(initialDiagnostico || '')
  const [programaTexto, setProgramaTexto] = useState<string>(initialProgramaTexto)
  const [treatmentItems, setTreatmentItems] = useState<TreatmentItem[]>(initialTreatmentItems)
  const [audios, setAudios] = useState<AudioRecording[]>(initialAudios)
  const [progressNotes, setProgressNotes] = useState(initialProgressNotes)

  // Pending transcription (before user chooses destination)
  const [pendingText, setPendingText] = useState('')

  // Saving states
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSavingDiagnosis, setIsSavingDiagnosis] = useState(false)
  const [isSavingProgramaTexto, setIsSavingProgramaTexto] = useState(false)
  const [isSavingTreatments, setIsSavingTreatments] = useState(false)

  // Debounce timers
  const treatmentDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const diagnosisDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const programaTextoDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const diagramDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Handle transcription from voice recorder
  const handleTranscription = useCallback((text: string) => {
    setPendingText(prev => prev + (prev ? ' ' : '') + text)
  }, [])

  // Handle audio saved
  const handleAudioSaved = useCallback(async (audio: AudioRecording) => {
    setAudios(prev => [...prev, audio])
    await addAudioRecording(medicalRecordId, audio)
  }, [medicalRecordId])

  // Add pending text to diagnosis
  const addToDiagnosis = useCallback(() => {
    if (!pendingText.trim()) return
    const newDiagnostico = diagnostico + (diagnostico ? '\n' : '') + pendingText.trim()
    setDiagnostico(newDiagnostico)
    setPendingText('')

    // Save
    if (diagnosisDebounceRef.current) clearTimeout(diagnosisDebounceRef.current)
    diagnosisDebounceRef.current = setTimeout(async () => {
      setIsSavingDiagnosis(true)
      const result = await updateDiagramAndDiagnosis(medicalRecordId, null, newDiagnostico)
      setIsSavingDiagnosis(false)
      if (result.success) {
        setLastSaved(new Date())
        toast.success('Agregado a Diagnostico')
      }
    }, 500)
  }, [pendingText, diagnostico, medicalRecordId])

  // Add pending text to progress notes
  const addToProgressNotes = useCallback(async () => {
    if (!pendingText.trim()) return
    const result = await addProgressNoteFromDictation(medicalRecordId, pendingText.trim())
    if (result.success) {
      setPendingText('')
      toast.success('Agregado a Evolucion')
      // Optimistically add to local state
      setProgressNotes(prev => [{
        id: crypto.randomUUID(),
        medical_record_id: medicalRecordId,
        appointment_id: null,
        nota: pendingText.trim(),
        created_by: '',
        created_at: new Date().toISOString(),
      }, ...prev])
    } else {
      toast.error(result.error || 'Error al agregar nota')
    }
  }, [pendingText, medicalRecordId])

  // Handle diagnosis text change with auto-save
  const handleDiagnosticoChange = useCallback((value: string) => {
    setDiagnostico(value)

    if (diagnosisDebounceRef.current) clearTimeout(diagnosisDebounceRef.current)
    diagnosisDebounceRef.current = setTimeout(async () => {
      setIsSavingDiagnosis(true)
      const result = await updateDiagramAndDiagnosis(medicalRecordId, null, value)
      setIsSavingDiagnosis(false)
      if (result.success) {
        setLastSaved(new Date())
      }
    }, 1500)
  }, [medicalRecordId])

  // Handle programa terapeutico text change with auto-save
  const handleProgramaTextoChange = useCallback((value: string) => {
    setProgramaTexto(value)

    if (programaTextoDebounceRef.current) clearTimeout(programaTextoDebounceRef.current)
    programaTextoDebounceRef.current = setTimeout(async () => {
      setIsSavingProgramaTexto(true)
      const result = await updateProgramaTerapeuticoTexto(medicalRecordId, value)
      setIsSavingProgramaTexto(false)
      if (result.success) {
        setLastSaved(new Date())
      }
    }, 1500)
  }, [medicalRecordId])

  // Handle diagram change with auto-save
  const handleDiagramChange = useCallback((data: string) => {
    setDiagramData(data)

    if (diagramDebounceRef.current) clearTimeout(diagramDebounceRef.current)
    diagramDebounceRef.current = setTimeout(async () => {
      const result = await updateDiagramAndDiagnosis(medicalRecordId, data, null)
      if (result.success) {
        setLastSaved(new Date())
        toast.success('Diagrama guardado')
      }
    }, 2000)
  }, [medicalRecordId])

  // Handle treatment change with debounce
  const handleTreatmentChange = useCallback((items: TreatmentItem[]) => {
    setTreatmentItems(items)

    if (treatmentDebounceRef.current) clearTimeout(treatmentDebounceRef.current)
    treatmentDebounceRef.current = setTimeout(async () => {
      setIsSavingTreatments(true)
      const result = await updateTreatments(medicalRecordId, items)
      setIsSavingTreatments(false)
      if (result.success) {
        toast.success('Tratamientos actualizados')
      }
    }, 800)
  }, [medicalRecordId])

  // Delete progress note
  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!confirm('¿Eliminar esta nota?')) return

    const result = await deleteProgressNote(noteId, medicalRecordId)
    if (result.success) {
      setProgressNotes(prev => prev.filter(n => n.id !== noteId))
      toast.success('Nota eliminada')
    } else {
      toast.error(result.error || 'Error al eliminar')
    }
  }, [medicalRecordId])

  // Clear diagnosis
  const handleClearDiagnosis = useCallback(async () => {
    if (!confirm('¿Borrar el diagnostico?')) return

    setDiagnostico('')
    const result = await updateDiagramAndDiagnosis(medicalRecordId, null, '')
    if (result.success) {
      setLastSaved(new Date())
      toast.success('Diagnostico borrado')
    }
  }, [medicalRecordId])

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-4">
      {/* Auto-save status */}
      <div className="flex items-center justify-center p-2 bg-muted rounded-lg text-sm text-muted-foreground">
        {isSavingDiagnosis || isSavingProgramaTexto ? (
          <span className="text-blue-600 flex items-center gap-1">
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando...
          </span>
        ) : lastSaved ? (
          <span className="text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            Guardado {lastSaved.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : (
          <span>Guardado automatico</span>
        )}
      </div>

      {/* 1. Evolution Photos */}
      <CollapsibleSection
        title="Fotos de Evolucion"
        icon={<Camera className="h-5 w-5" />}
        badge={evolutionPhotos.length > 0 ? `${evolutionPhotos.length}` : undefined}
        hasContent={evolutionPhotos.length > 0}
      >
        {evolutionPhotos.length > 0 ? (
          <LegacyPhotosGallery tipo="evolucion" photos={evolutionPhotos} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay fotos de evolucion
          </p>
        )}
      </CollapsibleSection>

      {/* 2. Voice Dictation - minimal */}
      <CollapsibleSection
        title="Dictado de Voz"
        icon={<Mic className="h-5 w-5" />}
        hasContent={pendingText.length > 0 || audios.length > 0}
        defaultOpen={true}
      >
        <div className="space-y-3">
          <VoiceRecorder
            medicalRecordId={medicalRecordId}
            onTranscription={handleTranscription}
            onAudioSaved={handleAudioSaved}
            disabled={isReadOnly}
          />

          {/* Pending text preview and destination choice */}
          {pendingText && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <Textarea
                value={pendingText}
                onChange={(e) => setPendingText(e.target.value)}
                className="min-h-[80px] resize-y text-sm"
                placeholder="Edite el texto antes de enviarlo..."
              />
              <div className="flex gap-2">
                {canEditDiagnosis && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addToDiagnosis}
                    disabled={isReadOnly}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    A Diagnostico
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addToProgressNotes}
                  disabled={isReadOnly}
                >
                  <ScrollText className="h-3 w-3 mr-1" />
                  A Evolucion
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPendingText('')}
                >
                  Descartar
                </Button>
              </div>
            </div>
          )}

          {/* Saved audios count */}
          {audios.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {audios.length} audio{audios.length !== 1 ? 's' : ''} guardado{audios.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* 3. Diagnosis - solo medico/admin pueden editar */}
      <CollapsibleSection
        title="Diagnostico"
        icon={<FileText className="h-5 w-5" />}
        hasContent={!!diagnostico}
      >
        <div className="space-y-2">
          {canEditDiagnosis ? (
            <Textarea
              value={diagnostico}
              onChange={(e) => handleDiagnosticoChange(e.target.value)}
              placeholder="Escriba el diagnostico..."
              className="min-h-[100px] resize-y"
              disabled={isReadOnly}
            />
          ) : (
            <div className="p-3 bg-muted rounded-lg min-h-[100px]">
              {diagnostico ? (
                <p className="text-sm whitespace-pre-wrap">{diagnostico}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Sin diagnostico</p>
              )}
            </div>
          )}
          {diagnostico && !isReadOnly && canEditDiagnosis && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearDiagnosis}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Borrar
              </Button>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* 4. Evolucion */}
      <CollapsibleSection
        title="Evolucion"
        icon={<ScrollText className="h-5 w-5" />}
        badge={progressNotes.length > 0 ? `${progressNotes.length}` : undefined}
        hasContent={progressNotes.length > 0}
      >
        {progressNotes.length > 0 ? (
          <div className="space-y-2">
            {progressNotes.map((note) => (
              <div key={note.id} className="p-3 bg-muted rounded text-sm group">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{note.created_by_user?.nombre || 'Usuario'}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatDate(note.created_at)}</span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="whitespace-pre-wrap">{note.nota}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay registros de evolucion
          </p>
        )}
      </CollapsibleSection>

      {/* 5. Leg Diagram */}
      <CollapsibleSection
        title="Diagrama de Piernas"
        icon={<Pencil className="h-5 w-5" />}
        hasContent={!!diagramData}
      >
        <VeinDiagramCanvas
          initialData={diagramData}
          onChange={handleDiagramChange}
          disabled={isReadOnly}
          width={550}
          height={700}
        />
      </CollapsibleSection>

      {/* 6. Treatment Program */}
      <CollapsibleSection
        title="Programa Terapeutico"
        icon={<Briefcase className="h-5 w-5" />}
        badge={treatmentItems.length > 0 ? `${treatmentItems.length}` : undefined}
        hasContent={treatmentItems.length > 0 || !!programaTexto}
      >
        <div className="space-y-4">
          {/* Programa Terapeutico Texto - above selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Notas del Programa Terapeutico</label>
            {canEditDiagnosis ? (
              <Textarea
                value={programaTexto}
                onChange={(e) => handleProgramaTextoChange(e.target.value)}
                placeholder="Escriba notas adicionales del programa terapeutico..."
                className="min-h-[80px] resize-y"
                disabled={isReadOnly}
              />
            ) : (
              <div className="p-3 bg-muted rounded-lg min-h-[80px]">
                {programaTexto ? (
                  <p className="text-sm whitespace-pre-wrap">{programaTexto}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin notas</p>
                )}
              </div>
            )}
          </div>

          {/* Treatment Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Tratamientos</label>
            <TreatmentSelector
              items={treatmentItems}
              services={treatmentOptions}
              onChange={handleTreatmentChange}
              disabled={isReadOnly}
              isSaving={isSavingTreatments}
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
