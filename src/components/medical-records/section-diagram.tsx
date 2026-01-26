'use client'

/**
 * Section Diagram Component
 *
 * Section for the leg diagram where doctors mark vein locations.
 * Uses fabric.js canvas for drawing.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { VeinDiagramCanvas } from './vein-diagram-canvas'
import { Pencil } from 'lucide-react'

interface SectionDiagramProps {
  /** Current diagram data (JSON string) */
  diagramData: string | null
  /** Callback when diagram changes */
  onChange: (data: string) => void
  /** Whether the section is disabled */
  disabled?: boolean
  /** Whether this is medico-only (shown but disabled for enfermera) */
  isMedicoOnly?: boolean
}

/**
 * Diagram section for marking vein locations on legs
 */
export function SectionDiagram({
  diagramData,
  onChange,
  disabled = false,
  isMedicoOnly = false,
}: SectionDiagramProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Pencil className="h-5 w-5" />
          Diagrama de Piernas
          {isMedicoOnly && (
            <span className="text-xs font-normal text-muted-foreground ml-2">
              (Solo medico)
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Marque las zonas afectadas por varices en el diagrama
        </CardDescription>
      </CardHeader>
      <CardContent>
        <VeinDiagramCanvas
          initialData={diagramData}
          onChange={onChange}
          disabled={disabled || isMedicoOnly}
          width={300}
          height={500}
        />
      </CardContent>
    </Card>
  )
}
