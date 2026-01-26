'use client'

/**
 * Edit Appointment Dialog Component
 *
 * Modal dialog for editing an existing appointment.
 * Fetches patients and doctors when opened.
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AppointmentForm } from '@/components/appointments/appointment-form'

/** Patient type for form */
interface Patient {
  id: string
  cedula: string
  nombre: string
  apellido: string
  celular: string
}

/** Doctor type for form */
interface Doctor {
  id: string
  email: string
  nombre: string | null
  apellido: string | null
}

/** Appointment data for editing */
interface AppointmentData {
  appointmentId: string
  patientId: string
  doctorId: string
  start: string
  end: string
  motivoConsulta?: string | null
  notas?: string | null
}

interface EditAppointmentDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void
  /** Appointment data to edit */
  appointment: AppointmentData | null
  /** Callback after successful update */
  onSuccess?: () => void
}

/**
 * Modal dialog for editing appointments.
 * Fetches patients and doctors list when opened.
 */
export function EditAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSuccess,
}: EditAppointmentDialogProps) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Fetch patients and doctors when dialog opens
  useEffect(() => {
    if (open && appointment) {
      setIsLoading(true)

      Promise.all([
        fetch('/api/patients').then(r => r.json()),
        fetch('/api/doctors').then(r => r.json()),
      ])
        .then(([patientsData, doctorsData]) => {
          setPatients(patientsData.patients || [])
          setDoctors(doctorsData.doctors || [])
        })
        .catch((error) => {
          console.error('Error fetching data:', error)
          toast.error('Error al cargar los datos')
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [open, appointment])

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setPatients([])
      setDoctors([])
    }
    onOpenChange(newOpen)
  }

  const handleSuccess = () => {
    toast.success('Cita actualizada exitosamente')
    onOpenChange(false)
    onSuccess?.()
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  if (!appointment) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cita</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
            <span className="ml-3 text-gray-500">Cargando...</span>
          </div>
        ) : (
          <AppointmentForm
            mode="edit"
            appointmentId={appointment.appointmentId}
            patients={patients}
            doctors={doctors}
            defaultValues={{
              patient: appointment.patientId,
              doctor: appointment.doctorId,
              start: appointment.start,
              end: appointment.end,
              motivo_consulta: appointment.motivoConsulta || '',
              notas: appointment.notas || '',
            }}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
