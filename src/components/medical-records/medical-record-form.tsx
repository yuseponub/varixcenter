'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, AlertTriangle, Save, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { SectionPatientData } from './section-patient-data'
import { SectionSymptoms } from './section-symptoms'
import { SectionOnset } from './section-onset'
import { SectionHistory } from './section-history'
import { SectionDiagnosis } from './section-diagnosis'
import { SectionCeap } from './section-ceap'
import { SectionVascularLab } from './section-vascular-lab'
import { SectionTreatment } from './section-treatment'
import { SectionDiagram } from './section-diagram'
import {
  createMedicalRecord,
  updateMedicalRecord,
  type MedicalRecordActionState,
} from '@/app/(protected)/historias/actions'
import type {
  MedicalRecordWithDetails,
  MedicalRecordSymptoms,
  MedicalRecordSigns,
  MedicalRecordOnset,
  MedicalRecordHistory,
  MedicalRecordVascularLab,
  CeapClassification,
} from '@/types'

interface Service {
  id: string
  nombre: string
  descripcion: string | null
  precio_base: number
  precio_variable: boolean
  precio_minimo: number | null
  precio_maximo: number | null
}

interface MedicalRecordFormProps {
  mode: 'create' | 'edit'
  patientData: {
    id: string
    nombre: string
    apellido: string
    cedula: string
    fecha_nacimiento?: string | null
    telefono?: string | null
    email?: string | null
    direccion?: string | null
    sexo?: string | null
  }
  appointmentData: {
    id: string
    fecha_hora_inicio: string
    motivo_consulta?: string | null
  }
  doctorId: string
  services: Service[]
  initialData?: MedicalRecordWithDetails
  userRole: 'admin' | 'medico' | 'enfermera'
}

/**
 * Main medical record form
 * Long continuous form with sections for all data
 * Role-based field restrictions
 */
export function MedicalRecordForm({
  mode,
  patientData,
  appointmentData,
  doctorId,
  services,
  initialData,
  userRole,
}: MedicalRecordFormProps) {
  const router = useRouter()
  const isEnfermera = userRole === 'enfermera'
  const isMedicoOnly = isEnfermera

  // Form state
  const [sintomas, setSintomas] = useState<MedicalRecordSymptoms>(
    initialData?.sintomas || {}
  )
  const [signos, setSignos] = useState<MedicalRecordSigns>(
    initialData?.signos || {}
  )
  const [inicioRelacionado, setInicioRelacionado] = useState<MedicalRecordOnset>(
    initialData?.inicio_relacionado || {}
  )
  const [antecedentes, setAntecedentes] = useState<MedicalRecordHistory>(
    initialData?.antecedentes || {}
  )
  const [laboratorioVascular, setLaboratorioVascular] = useState<MedicalRecordVascularLab>(
    initialData?.laboratorio_vascular || {}
  )
  const [diagnostico, setDiagnostico] = useState<string | null>(
    initialData?.diagnostico || null
  )
  const [ceapIzquierda, setCeapIzquierda] = useState<CeapClassification | null>(
    initialData?.ceap_pierna_izquierda || null
  )
  const [ceapDerecha, setCeapDerecha] = useState<CeapClassification | null>(
    initialData?.ceap_pierna_derecha || null
  )
  const [tratamientoIds, setTratamientoIds] = useState<string[]>(
    initialData?.tratamiento_ids || []
  )
  const [diagramaPiernas, setDiagramaPiernas] = useState<string | null>(
    initialData?.diagrama_piernas || null
  )

  // Create bound action for update mode
  const boundUpdateAction = useCallback(
    (prevState: MedicalRecordActionState | null, formData: FormData) => {
      if (mode === 'edit' && initialData?.id) {
        return updateMedicalRecord(initialData.id, prevState, formData)
      }
      return createMedicalRecord(prevState, formData)
    },
    [mode, initialData?.id]
  )

  const [state, formAction, isPending] = useActionState<MedicalRecordActionState | null, FormData>(
    mode === 'create' ? createMedicalRecord : boundUpdateAction,
    null
  )

  // Handle success/error
  useEffect(() => {
    if (state?.success && state.data) {
      toast.success(
        mode === 'create'
          ? 'Historia clinica creada exitosamente'
          : 'Historia clinica actualizada'
      )
      router.push(`/historias/${state.data.id}`)
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, router, mode])

  // Build form data
  const handleSubmit = useCallback(
    (formData: FormData, saveAsDraft: boolean = false) => {
      // Core fields
      formData.set('patient_id', patientData.id)
      formData.set('appointment_id', appointmentData.id)
      formData.set('doctor_id', doctorId)

      // JSONB fields
      formData.set('sintomas', JSON.stringify(sintomas))
      formData.set('signos', JSON.stringify(signos))
      formData.set('inicio_relacionado', JSON.stringify(inicioRelacionado))
      formData.set('antecedentes', JSON.stringify(antecedentes))
      formData.set('laboratorio_vascular', JSON.stringify(laboratorioVascular))

      // Medico-only fields (only set if not enfermera)
      if (!isEnfermera) {
        formData.set('diagnostico', diagnostico || '')
        formData.set('ceap_pierna_izquierda', ceapIzquierda || '')
        formData.set('ceap_pierna_derecha', ceapDerecha || '')
        formData.set('tratamiento_ids', JSON.stringify(tratamientoIds))
        formData.set('diagrama_piernas', diagramaPiernas || '')
      }

      // Status
      formData.set('estado', saveAsDraft ? 'borrador' : 'borrador')

      formAction(formData)
    },
    [
      patientData.id,
      appointmentData.id,
      doctorId,
      sintomas,
      signos,
      inicioRelacionado,
      antecedentes,
      laboratorioVascular,
      diagnostico,
      ceapIzquierda,
      ceapDerecha,
      tratamientoIds,
      diagramaPiernas,
      isEnfermera,
      formAction,
    ]
  )

  const handleSaveDraft = () => {
    const formData = new FormData()
    handleSubmit(formData, true)
  }

  const handleFormSubmit = (formData: FormData) => {
    handleSubmit(formData, false)
  }

  return (
    <form action={handleFormSubmit} className="space-y-6">
      {/* Error display */}
      {state?.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Patient Data Section (readonly) */}
      <SectionPatientData
        patient={patientData}
        appointmentDate={appointmentData.fecha_hora_inicio}
        motivoConsulta={appointmentData.motivo_consulta}
      />

      {/* Enfermera-editable sections */}
      <div className="space-y-6">
        <SectionSymptoms
          sintomas={sintomas}
          signos={signos}
          onSintomasChange={setSintomas}
          onSignosChange={setSignos}
          disabled={isPending}
        />

        <SectionOnset
          inicioRelacionado={inicioRelacionado}
          onChange={setInicioRelacionado}
          disabled={isPending}
        />

        <SectionHistory
          antecedentes={antecedentes}
          onChange={setAntecedentes}
          disabled={isPending}
        />
      </div>

      {/* Medico-only sections */}
      <div className="space-y-6">
        <SectionVascularLab
          laboratorioVascular={laboratorioVascular}
          onChange={setLaboratorioVascular}
          disabled={isPending || isMedicoOnly}
          isMedicoOnly={isMedicoOnly}
        />

        <SectionDiagnosis
          diagnostico={diagnostico}
          onChange={setDiagnostico}
          disabled={isPending || isMedicoOnly}
          isMedicoOnly={isMedicoOnly}
        />

        <SectionCeap
          ceapIzquierda={ceapIzquierda}
          ceapDerecha={ceapDerecha}
          onCeapIzquierdaChange={setCeapIzquierda}
          onCeapDerechaChange={setCeapDerecha}
          disabled={isPending || isMedicoOnly}
          isMedicoOnly={isMedicoOnly}
        />

        <SectionTreatment
          tratamientoIds={tratamientoIds}
          onChange={setTratamientoIds}
          services={services}
          disabled={isPending || isMedicoOnly}
          isMedicoOnly={isMedicoOnly}
        />

        <SectionDiagram
          diagramData={diagramaPiernas}
          onChange={setDiagramaPiernas}
          disabled={isPending || isMedicoOnly}
          isMedicoOnly={isMedicoOnly}
        />
      </div>

      {/* Form actions */}
      <div className="flex justify-end gap-4 pt-4 border-t sticky bottom-0 bg-background py-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleSaveDraft}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar Borrador
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {mode === 'create' ? 'Crear Historia' : 'Guardar Cambios'}
        </Button>
      </div>
    </form>
  )
}
