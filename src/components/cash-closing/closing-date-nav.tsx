'use client'

/**
 * Navegacion de fecha para la pantalla de cierre de caja.
 * Permite hacer el cierre de un dia anterior (antes solo se podia el de hoy).
 */

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ClosingDateNavProps {
  /** Fecha civil seleccionada YYYY-MM-DD (Bogota). */
  fecha: string
  /** Fecha civil de hoy YYYY-MM-DD (Bogota), calculada en el server. */
  hoy: string
}

/** Suma dias a una fecha civil YYYY-MM-DD sin lios de zona horaria. */
function shiftFecha(fecha: string, days: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function ClosingDateNav({ fecha, hoy }: ClosingDateNavProps) {
  const router = useRouter()
  const go = useCallback(
    (nextFecha: string) => router.push(`/cierres/nuevo?fecha=${nextFecha}`),
    [router]
  )
  const esHoy = fecha === hoy

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        aria-label="Dia anterior"
        onClick={() => go(shiftFecha(fecha, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Input
        type="date"
        value={fecha}
        max={hoy}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="w-[150px]"
        aria-label="Seleccionar fecha del cierre"
      />
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        aria-label="Dia siguiente"
        disabled={esHoy}
        onClick={() => go(shiftFecha(fecha, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!esHoy && (
        <Button variant="outline" onClick={() => go(hoy)}>
          Hoy
        </Button>
      )}
    </div>
  )
}
