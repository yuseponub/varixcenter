'use client'

import { useTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2, UserCheck } from 'lucide-react'
import { markPatientAsAttended } from '@/app/(protected)/historias/[id]/attendance-actions'
import type { PatientAttendance } from '@/types'

interface MarkAttendedButtonProps {
  patientId: string
  initialAttendance?: PatientAttendance | null
}

export function MarkAttendedButton({ patientId, initialAttendance }: MarkAttendedButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [attendance, setAttendance] = useState<PatientAttendance | null>(initialAttendance || null)
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      const result = await markPatientAsAttended(patientId)
      if (result.success && result.attendance) {
        setAttendance(result.attendance)
      } else if (result.error) {
        setError(result.error)
      }
    })
  }

  // Format time as HH:MM
  const formatTime = (timeStr: string) => {
    return timeStr.substring(0, 5)
  }

  if (attendance) {
    return (
      <Button variant="outline" className="bg-green-50 border-green-300 text-green-700 cursor-default" disabled>
        <CheckCircle className="mr-2 h-4 w-4" />
        Atendido a las {formatTime(attendance.hora)}
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={handleClick}
        disabled={isPending}
        className="bg-green-600 hover:bg-green-700 text-white"
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UserCheck className="mr-2 h-4 w-4" />
        )}
        {isPending ? 'Marcando...' : 'Marcar Atendido'}
      </Button>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
