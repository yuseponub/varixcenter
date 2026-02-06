'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, Edit, Save, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updatePatient } from '@/app/(protected)/historias/actions'

interface PatientInfoCardProps {
  patientId: string
  patient: {
    nombre: string
    apellido: string
    cedula: string
    celular: string | null
    fecha_nacimiento: string | null
  }
  appointment?: {
    fecha_hora_inicio: string
    motivo_consulta: string | null
  }
  canEdit: boolean
}

export function PatientInfoCard({
  patientId,
  patient,
  appointment,
  canEdit,
}: PatientInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Form state
  const [nombre, setNombre] = useState(patient.nombre)
  const [apellido, setApellido] = useState(patient.apellido)
  const [cedula, setCedula] = useState(patient.cedula)
  const [celular, setCelular] = useState(patient.celular || '')
  const [fechaNacimiento, setFechaNacimiento] = useState(patient.fecha_nacimiento || '')

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const handleCancel = () => {
    // Reset to original values
    setNombre(patient.nombre)
    setApellido(patient.apellido)
    setCedula(patient.cedula)
    setCelular(patient.celular || '')
    setFechaNacimiento(patient.fecha_nacimiento || '')
    setIsEditing(false)
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await updatePatient(patientId, {
        nombre,
        apellido,
        cedula,
        celular: celular || undefined,
        fecha_nacimiento: fechaNacimiento || undefined,
      })

      if (result.success) {
        toast.success('Paciente actualizado')
        setIsEditing(false)
      } else {
        toast.error(result.error || 'Error al actualizar')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Paciente
          </div>
          {canEdit && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apellido">Apellido</Label>
                <Input
                  id="apellido"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  placeholder="Apellido"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cedula">Cedula</Label>
                <Input
                  id="cedula"
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  placeholder="Cedula"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="celular">Celular</Label>
                <Input
                  id="celular"
                  value={celular}
                  onChange={(e) => setCelular(e.target.value)}
                  placeholder="Celular"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha_nacimiento">Fecha de Nacimiento</Label>
              <Input
                id="fecha_nacimiento"
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xl font-semibold">
              {patient.nombre} {patient.apellido}
            </p>
            <p className="text-muted-foreground">CC: {patient.cedula}</p>
            {patient.celular && (
              <p className="text-sm">Tel: {patient.celular}</p>
            )}
            {patient.fecha_nacimiento && (
              <p className="text-sm">
                <span className="font-medium">Fecha de Nacimiento:</span>{' '}
                {new Date(patient.fecha_nacimiento).toLocaleDateString('es-CO')}
              </p>
            )}
            {appointment && (
              <p className="text-sm">
                <span className="font-medium">Cita:</span>{' '}
                {formatDate(appointment.fecha_hora_inicio)}
                {appointment.motivo_consulta && (
                  <> - {appointment.motivo_consulta}</>
                )}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
