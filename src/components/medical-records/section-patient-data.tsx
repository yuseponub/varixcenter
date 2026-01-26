'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, Calendar, Phone, Mail, MapPin } from 'lucide-react'

interface PatientData {
  nombre: string
  apellido: string
  cedula: string
  fecha_nacimiento?: string | null
  telefono?: string | null
  email?: string | null
  direccion?: string | null
  sexo?: string | null
}

interface SectionPatientDataProps {
  patient: PatientData
  appointmentDate?: string
  motivoConsulta?: string | null
}

/**
 * Section to display patient data (readonly)
 * Shows patient identification and appointment context
 */
export function SectionPatientData({
  patient,
  appointmentDate,
  motivoConsulta,
}: SectionPatientDataProps) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const calculateAge = (birthDate: string) => {
    const today = new Date()
    const birth = new Date(birthDate)
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="h-5 w-5" />
          Datos del Paciente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Patient name and ID */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">
              {patient.nombre} {patient.apellido}
            </h3>
            <p className="text-muted-foreground">CC: {patient.cedula}</p>
          </div>
          {patient.sexo && (
            <Badge variant="outline">
              {patient.sexo === 'M' ? 'Masculino' : patient.sexo === 'F' ? 'Femenino' : patient.sexo}
            </Badge>
          )}
        </div>

        {/* Age and birth date */}
        {patient.fecha_nacimiento && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {formatDate(patient.fecha_nacimiento)} ({calculateAge(patient.fecha_nacimiento)} anos)
            </span>
          </div>
        )}

        {/* Contact info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {patient.telefono && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>{patient.telefono}</span>
            </div>
          )}
          {patient.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>{patient.email}</span>
            </div>
          )}
          {patient.direccion && (
            <div className="flex items-center gap-2 text-muted-foreground col-span-full">
              <MapPin className="h-4 w-4" />
              <span>{patient.direccion}</span>
            </div>
          )}
        </div>

        {/* Appointment context */}
        {(appointmentDate || motivoConsulta) && (
          <div className="pt-4 border-t">
            {appointmentDate && (
              <p className="text-sm">
                <span className="font-medium">Fecha de cita:</span>{' '}
                {formatDate(appointmentDate)}
              </p>
            )}
            {motivoConsulta && (
              <p className="text-sm mt-1">
                <span className="font-medium">Motivo de consulta:</span>{' '}
                {motivoConsulta}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
