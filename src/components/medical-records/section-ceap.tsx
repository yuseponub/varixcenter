'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Activity, Lock } from 'lucide-react'
import type { CeapClassification } from '@/types'
import { CEAP_CLASSIFICATIONS, CEAP_LABELS, CEAP_VARIANTS } from '@/types'

interface SectionCeapProps {
  ceapIzquierda: CeapClassification | null
  ceapDerecha: CeapClassification | null
  onCeapIzquierdaChange: (value: CeapClassification | null) => void
  onCeapDerechaChange: (value: CeapClassification | null) => void
  disabled?: boolean
  isMedicoOnly?: boolean
}

/**
 * Section for CEAP classification per leg
 * Only editable by medico
 */
export function SectionCeap({
  ceapIzquierda,
  ceapDerecha,
  onCeapIzquierdaChange,
  onCeapDerechaChange,
  disabled = false,
  isMedicoOnly = false,
}: SectionCeapProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Clasificacion CEAP
          </CardTitle>
          {isMedicoOnly && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Solo Medico
            </Badge>
          )}
        </div>
        <CardDescription>
          Clasificacion clinica de la enfermedad venosa cronica (componente C)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pierna Izquierda */}
          <div className="space-y-2">
            <Label htmlFor="ceap_izquierda" className="text-sm font-medium">
              Pierna Izquierda
            </Label>
            <Select
              value={ceapIzquierda || 'none'}
              onValueChange={(value) =>
                onCeapIzquierdaChange(value === 'none' ? null : (value as CeapClassification))
              }
              disabled={disabled}
            >
              <SelectTrigger id="ceap_izquierda">
                <SelectValue placeholder="Seleccione clasificacion" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin clasificar</SelectItem>
                {CEAP_CLASSIFICATIONS.map((ceap) => (
                  <SelectItem key={ceap} value={ceap}>
                    {CEAP_LABELS[ceap]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ceapIzquierda && (
              <Badge variant={CEAP_VARIANTS[ceapIzquierda]} className="mt-1">
                {ceapIzquierda}
              </Badge>
            )}
          </div>

          {/* Pierna Derecha */}
          <div className="space-y-2">
            <Label htmlFor="ceap_derecha" className="text-sm font-medium">
              Pierna Derecha
            </Label>
            <Select
              value={ceapDerecha || 'none'}
              onValueChange={(value) =>
                onCeapDerechaChange(value === 'none' ? null : (value as CeapClassification))
              }
              disabled={disabled}
            >
              <SelectTrigger id="ceap_derecha">
                <SelectValue placeholder="Seleccione clasificacion" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin clasificar</SelectItem>
                {CEAP_CLASSIFICATIONS.map((ceap) => (
                  <SelectItem key={ceap} value={ceap}>
                    {CEAP_LABELS[ceap]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ceapDerecha && (
              <Badge variant={CEAP_VARIANTS[ceapDerecha]} className="mt-1">
                {ceapDerecha}
              </Badge>
            )}
          </div>
        </div>

        {/* CEAP Reference */}
        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h4 className="font-medium text-sm mb-2">Referencia CEAP:</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li><strong>C0:</strong> Sin signos visibles de enfermedad venosa</li>
            <li><strong>C1:</strong> Telangiectasias o venas reticulares</li>
            <li><strong>C2:</strong> Varices</li>
            <li><strong>C3:</strong> Edema sin cambios cutaneos</li>
            <li><strong>C4:</strong> Cambios cutaneos (pigmentacion, eczema, lipodermatoesclerosis)</li>
            <li><strong>C5:</strong> Ulcera venosa cicatrizada</li>
            <li><strong>C6:</strong> Ulcera venosa activa</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
