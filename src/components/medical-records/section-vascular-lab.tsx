'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { CheckboxGroup } from './checkbox-group'
import { Microscope, Lock } from 'lucide-react'
import type { MedicalRecordVascularLab } from '@/types'
import { VASCULAR_LAB_LABELS } from '@/types'

interface SectionVascularLabProps {
  laboratorioVascular: MedicalRecordVascularLab
  onChange: (data: MedicalRecordVascularLab) => void
  disabled?: boolean
  isMedicoOnly?: boolean
}

/**
 * Section for vascular laboratory studies
 * Only editable by medico
 */
export function SectionVascularLab({
  laboratorioVascular,
  onChange,
  disabled = false,
  isMedicoOnly = false,
}: SectionVascularLabProps) {
  const options = Object.entries(VASCULAR_LAB_LABELS).map(([key, label]) => ({
    key,
    label,
  }))

  const handleChange = (key: string, checked: boolean) => {
    onChange({
      ...laboratorioVascular,
      [key]: checked,
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Microscope className="h-5 w-5" />
            Laboratorio Vascular
          </CardTitle>
          {isMedicoOnly && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Solo Medico
            </Badge>
          )}
        </div>
        <CardDescription>
          Estudios de laboratorio vascular realizados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CheckboxGroup
          options={options}
          values={laboratorioVascular as Record<string, boolean>}
          onChange={handleChange}
          disabled={disabled}
          columns={2}
          showOtros
          otrosValue={laboratorioVascular.otros || ''}
          onOtrosChange={(value) => onChange({ ...laboratorioVascular, otros: value })}
          otrosLabel="Otros estudios"
        />

        <div className="pt-4 border-t">
          <Label htmlFor="hallazgos" className="text-sm">
            Hallazgos
          </Label>
          <Textarea
            id="hallazgos"
            value={laboratorioVascular.hallazgos || ''}
            onChange={(e) => onChange({ ...laboratorioVascular, hallazgos: e.target.value })}
            placeholder={
              disabled && isMedicoOnly
                ? 'Solo el medico puede editar este campo'
                : 'Describa los hallazgos de los estudios realizados...'
            }
            disabled={disabled}
            rows={4}
            className="mt-1"
          />
        </div>
      </CardContent>
    </Card>
  )
}
