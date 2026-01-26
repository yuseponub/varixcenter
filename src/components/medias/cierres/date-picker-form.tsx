'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface DatePickerFormProps {
  basePath: string
}

export function DatePickerForm({ basePath }: DatePickerFormProps) {
  const router = useRouter()
  const [date, setDate] = useState<Date | undefined>(undefined)

  const handleContinue = () => {
    if (date) {
      const fechaStr = format(date, 'yyyy-MM-dd')
      router.push(`${basePath}?fecha=${fechaStr}`)
    }
  }

  // Disable future dates
  const disabledDays = { after: new Date() }

  return (
    <div className="space-y-4">
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        disabled={disabledDays}
        locale={es}
        className="rounded-md border"
      />

      {date && (
        <div className="flex items-center justify-between">
          <p className="text-sm">
            Fecha seleccionada:{' '}
            <strong>{format(date, 'dd MMMM yyyy', { locale: es })}</strong>
          </p>
          <Button onClick={handleContinue}>Continuar</Button>
        </div>
      )}
    </div>
  )
}
