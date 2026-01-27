'use client'

import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

const MONTHS = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
]

function getDaysInMonth(month: string, year: string): number {
  const y = parseInt(year) || 2000
  const m = parseInt(month)
  if (!m) return 31
  return new Date(y, m, 0).getDate()
}

interface DateOfBirthInputProps {
  name: string
  value?: string
  onChange?: (value: string) => void
}

export function DateOfBirthInput({ name, value, onChange }: DateOfBirthInputProps) {
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')

  // Parse initial value (YYYY-MM-DD)
  useEffect(() => {
    if (value && value.includes('-')) {
      const [y, m, d] = value.split('-')
      setYear(y || '')
      setMonth(m || '')
      setDay(d || '')
    }
  }, [value])

  const daysInMonth = getDaysInMonth(month, year)
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    String(i + 1).padStart(2, '0')
  )

  const updateDate = (newYear: string, newMonth: string, newDay: string) => {
    if (newYear && newMonth && newDay && newYear.length === 4) {
      const dateStr = `${newYear}-${newMonth}-${newDay}`
      onChange?.(dateStr)
    } else if (!newYear && !newMonth && !newDay) {
      onChange?.('')
    }
  }

  const handleYearChange = (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 4)
    setYear(cleaned)
    updateDate(cleaned, month, day)
  }

  const handleMonthChange = (val: string) => {
    setMonth(val)
    // Adjust day if exceeds new month's days
    const maxDays = getDaysInMonth(val, year)
    const adjustedDay = parseInt(day) > maxDays ? String(maxDays).padStart(2, '0') : day
    if (adjustedDay !== day) setDay(adjustedDay)
    updateDate(year, val, adjustedDay)
  }

  const handleDayChange = (val: string) => {
    setDay(val)
    updateDate(year, month, val)
  }

  // Hidden input for form submission
  const fullDate = year.length === 4 && month && day ? `${year}-${month}-${day}` : ''

  return (
    <div className="flex gap-2">
      <input type="hidden" name={name} value={fullDate} />
      <div className="w-[100px]">
        <Input
          placeholder="Año"
          value={year}
          onChange={(e) => handleYearChange(e.target.value)}
          maxLength={4}
          inputMode="numeric"
        />
      </div>
      <div className="flex-1">
        <Select value={month} onValueChange={handleMonthChange}>
          <SelectTrigger>
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-[80px]">
        <Select value={day} onValueChange={handleDayChange}>
          <SelectTrigger>
            <SelectValue placeholder="Día" />
          </SelectTrigger>
          <SelectContent>
            {days.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
