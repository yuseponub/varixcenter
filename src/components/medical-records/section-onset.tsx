'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CheckboxGroup } from './checkbox-group'
import { Clock } from 'lucide-react'
import type { MedicalRecordOnset } from '@/types'
import { ONSET_LABELS } from '@/types'

interface SectionOnsetProps {
  inicioRelacionado: MedicalRecordOnset
  onChange: (data: MedicalRecordOnset) => void
  disabled?: boolean
}

/**
 * Section for onset-related factors
 * "Inicio relacionado con" - factors that may have triggered or are related to symptoms
 * Editable by enfermera
 */
export function SectionOnset({
  inicioRelacionado,
  onChange,
  disabled = false,
}: SectionOnsetProps) {
  const options = Object.entries(ONSET_LABELS).map(([key, label]) => ({
    key,
    label,
  }))

  const handleChange = (key: string, checked: boolean) => {
    onChange({
      ...inicioRelacionado,
      [key]: checked,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Inicio Relacionado Con
        </CardTitle>
        <CardDescription>
          Factores que pueden estar relacionados con el inicio de los sintomas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CheckboxGroup
          options={options}
          values={inicioRelacionado as Record<string, boolean>}
          onChange={handleChange}
          disabled={disabled}
          columns={3}
          showOtros
          otrosValue={inicioRelacionado.otros || ''}
          onOtrosChange={(value) => onChange({ ...inicioRelacionado, otros: value })}
          otrosLabel="Otros factores"
        />
      </CardContent>
    </Card>
  )
}
