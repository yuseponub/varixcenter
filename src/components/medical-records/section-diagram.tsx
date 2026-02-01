'use client'

/**
 * Section Diagram Component
 *
 * Section for the leg diagram where doctors mark vein locations.
 * Uses fabric.js canvas for drawing.
 * Collapsible by default to save space.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { VeinDiagramCanvas } from './vein-diagram-canvas'
import { Pencil, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionDiagramProps {
  /** Current diagram data (JSON string) */
  diagramData: string | null
  /** Callback when diagram changes */
  onChange: (data: string) => void
  /** Whether the section is disabled */
  disabled?: boolean
  /** Whether this is medico-only (shown but disabled for enfermera) */
  isMedicoOnly?: boolean
  /** Whether the section starts expanded */
  defaultExpanded?: boolean
}

/**
 * Diagram section for marking vein locations on legs
 */
export function SectionDiagram({
  diagramData,
  onChange,
  disabled = false,
  isMedicoOnly = false,
  defaultExpanded = false,
}: SectionDiagramProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  // Track if canvas has been mounted (once expanded, keep it mounted)
  const [hasBeenExpanded, setHasBeenExpanded] = useState(defaultExpanded)

  const handleToggle = () => {
    if (!isExpanded && !hasBeenExpanded) {
      setHasBeenExpanded(true)
    }
    setIsExpanded(!isExpanded)
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={handleToggle}
      >
        <CardTitle className="text-lg flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
          <Pencil className="h-5 w-5" />
          Diagrama de Piernas
          {isMedicoOnly && (
            <span className="text-xs font-normal text-muted-foreground ml-2">
              (Solo medico)
            </span>
          )}
          {!isExpanded && (
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              Toque para expandir
            </span>
          )}
        </CardTitle>
      </CardHeader>
      {hasBeenExpanded && (
        <CardContent className={cn(!isExpanded && 'hidden')}>
          <VeinDiagramCanvas
            initialData={diagramData}
            onChange={onChange}
            disabled={disabled || isMedicoOnly}
            width={300}
            height={500}
          />
        </CardContent>
      )}
    </Card>
  )
}
