'use client'

/**
 * Doctor Filter Component
 *
 * Dropdown filter for selecting a doctor in the appointment calendar.
 * Uses shadcn/ui Select component.
 *
 * APT-02: Doctor filter dropdown shows available medicos
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Doctor } from '@/types/appointments'

/**
 * Props for DoctorFilter component
 */
interface DoctorFilterProps {
  /** List of available doctors */
  doctors: Doctor[]
  /** Currently selected doctor ID (empty string = all doctors) */
  value: string
  /** Callback when selection changes */
  onValueChange: (doctorId: string) => void
  /** Whether the filter is disabled */
  disabled?: boolean
  /** Additional className for the trigger */
  className?: string
}

/**
 * Doctor selection dropdown for filtering calendar appointments.
 *
 * Features:
 * - "Todos los medicos" option to show all appointments
 * - Displays doctor name or email
 * - Uses shadcn/ui Select for consistent styling
 */
export function DoctorFilter({
  doctors,
  value,
  onValueChange,
  disabled = false,
  className,
}: DoctorFilterProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Filtrar por medico" />
      </SelectTrigger>
      <SelectContent>
        {/* Option to show all doctors */}
        <SelectItem value="all">Todos los medicos</SelectItem>

        {/* Individual doctor options */}
        {doctors.map((doctor) => (
          <SelectItem key={doctor.id} value={doctor.id}>
            {doctor.nombre || doctor.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
