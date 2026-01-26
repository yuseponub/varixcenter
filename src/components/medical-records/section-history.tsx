'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CheckboxGroup } from './checkbox-group'
import { FileText } from 'lucide-react'
import type { MedicalRecordHistory } from '@/types'
import { HISTORY_LABELS } from '@/types'

interface SectionHistoryProps {
  antecedentes: MedicalRecordHistory
  onChange: (data: MedicalRecordHistory) => void
  disabled?: boolean
}

/**
 * Section for medical history (antecedentes patologicos)
 * Editable by enfermera
 */
export function SectionHistory({
  antecedentes,
  onChange,
  disabled = false,
}: SectionHistoryProps) {
  const options = Object.entries(HISTORY_LABELS).map(([key, label]) => ({
    key,
    label,
  }))

  const handleChange = (key: string, checked: boolean) => {
    onChange({
      ...antecedentes,
      [key]: checked,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Antecedentes Patologicos
        </CardTitle>
        <CardDescription>
          Historia medica relevante del paciente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CheckboxGroup
          options={options}
          values={antecedentes as Record<string, boolean>}
          onChange={handleChange}
          disabled={disabled}
          columns={3}
          showOtros
          otrosValue={antecedentes.otros || ''}
          onOtrosChange={(value) => onChange({ ...antecedentes, otros: value })}
          otrosLabel="Otros antecedentes"
        />

        <div className="pt-4 border-t">
          <Label htmlFor="observaciones" className="text-sm">
            Observaciones adicionales
          </Label>
          <Textarea
            id="observaciones"
            value={antecedentes.observaciones || ''}
            onChange={(e) => onChange({ ...antecedentes, observaciones: e.target.value })}
            placeholder="Notas adicionales sobre los antecedentes del paciente..."
            disabled={disabled}
            rows={3}
            className="mt-1"
          />
        </div>
      </CardContent>
    </Card>
  )
}
