'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, Lock } from 'lucide-react'

interface SectionDiagnosisProps {
  diagnostico: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  isMedicoOnly?: boolean
}

/**
 * Section for diagnosis (diagnostico)
 * Free text field for medical diagnosis
 * Only editable by medico
 */
export function SectionDiagnosis({
  diagnostico,
  onChange,
  disabled = false,
  isMedicoOnly = false,
}: SectionDiagnosisProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Diagnostico
          </CardTitle>
          {isMedicoOnly && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Solo Medico
            </Badge>
          )}
        </div>
        <CardDescription>
          Diagnostico medico basado en la evaluacion clinica
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          value={diagnostico || ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={
            disabled && isMedicoOnly
              ? 'Solo el medico puede editar este campo'
              : 'Escriba el diagnostico del paciente...'
          }
          disabled={disabled}
          rows={6}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Describa el diagnostico de manera clara y detallada
        </p>
      </CardContent>
    </Card>
  )
}
