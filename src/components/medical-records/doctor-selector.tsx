'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { updateMedicalRecordDoctor } from '@/app/(protected)/historias/actions'

interface Doctor {
  id: string
  email: string
  nombre: string | null
  apellido: string | null
}

interface DoctorSelectorProps {
  medicalRecordId: string
  currentDoctorId: string | null
  doctors: Doctor[]
  canEdit: boolean
}

export function DoctorSelector({
  medicalRecordId,
  currentDoctorId,
  doctors,
  canEdit,
}: DoctorSelectorProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState(currentDoctorId || '')
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    if (!selectedDoctorId) {
      toast.error('Seleccione un medico')
      return
    }

    startTransition(async () => {
      const result = await updateMedicalRecordDoctor(medicalRecordId, selectedDoctorId)

      if (result.success) {
        toast.success('Medico asignado correctamente')
      } else {
        toast.error(result.error || 'Error al asignar medico')
      }
    })
  }

  const getDoctorDisplayName = (doctor: Doctor) => {
    if (doctor.nombre || doctor.apellido) {
      return `Dr. ${doctor.nombre || ''} ${doctor.apellido || ''}`.trim()
    }
    return doctor.email
  }

  if (!canEdit) {
    const currentDoctor = doctors.find((d) => d.id === currentDoctorId)
    return (
      <div className="text-sm">
        {currentDoctor ? getDoctorDisplayName(currentDoctor) : 'Sin medico asignado'}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Seleccionar medico" />
        </SelectTrigger>
        <SelectContent>
          {doctors.map((doctor) => (
            <SelectItem key={doctor.id} value={doctor.id}>
              {getDoctorDisplayName(doctor)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedDoctorId !== currentDoctorId && (
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserCheck className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  )
}
