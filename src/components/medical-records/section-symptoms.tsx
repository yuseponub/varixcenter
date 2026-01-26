'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckboxGroup } from './checkbox-group'
import { Stethoscope, Activity } from 'lucide-react'
import type {
  MedicalRecordSymptoms,
  MedicalRecordSigns,
} from '@/types'
import { SYMPTOM_LABELS, SIGN_LABELS } from '@/types'

interface SectionSymptomsProps {
  sintomas: MedicalRecordSymptoms
  signos: MedicalRecordSigns
  onSintomasChange: (sintomas: MedicalRecordSymptoms) => void
  onSignosChange: (signos: MedicalRecordSigns) => void
  disabled?: boolean
}

/**
 * Section for symptoms (sintomas) and signs (signos)
 * This is the "Motivo de Consulta" and "Examen Fisico" section
 * Editable by enfermera
 */
export function SectionSymptoms({
  sintomas,
  signos,
  onSintomasChange,
  onSignosChange,
  disabled = false,
}: SectionSymptomsProps) {
  const symptomOptions = Object.entries(SYMPTOM_LABELS).map(([key, label]) => ({
    key,
    label,
  }))

  const signOptions = Object.entries(SIGN_LABELS).map(([key, label]) => ({
    key,
    label,
  }))

  const handleSymptomChange = (key: string, checked: boolean) => {
    onSintomasChange({
      ...sintomas,
      [key]: checked,
    })
  }

  const handleSignChange = (key: string, checked: boolean) => {
    onSignosChange({
      ...signos,
      [key]: checked,
    })
  }

  return (
    <div className="space-y-6">
      {/* Sintomas (Motivo de Consulta) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Motivo de Consulta (Sintomas)
          </CardTitle>
          <CardDescription>
            Seleccione los sintomas que presenta el paciente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CheckboxGroup
            options={symptomOptions}
            values={sintomas as Record<string, boolean>}
            onChange={handleSymptomChange}
            disabled={disabled}
            columns={3}
            showOtros
            otrosValue={sintomas.otros || ''}
            onOtrosChange={(value) => onSintomasChange({ ...sintomas, otros: value })}
            otrosLabel="Otros sintomas"
          />

          <div className="pt-4 border-t">
            <Label htmlFor="tiempo_evolucion" className="text-sm">
              Tiempo de evolucion
            </Label>
            <Input
              id="tiempo_evolucion"
              value={sintomas.tiempo_evolucion || ''}
              onChange={(e) => onSintomasChange({ ...sintomas, tiempo_evolucion: e.target.value })}
              placeholder="Ej: 2 anos, 6 meses, etc."
              disabled={disabled}
              className="mt-1 max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Signos (Examen Fisico) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Examen Fisico (Signos)
          </CardTitle>
          <CardDescription>
            Hallazgos del examen fisico
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CheckboxGroup
            options={signOptions}
            values={signos as Record<string, boolean>}
            onChange={handleSignChange}
            disabled={disabled}
            columns={3}
            showOtros
            otrosValue={signos.otros || ''}
            onOtrosChange={(value) => onSignosChange({ ...signos, otros: value })}
            otrosLabel="Otros hallazgos"
          />
        </CardContent>
      </Card>
    </div>
  )
}
