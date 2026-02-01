'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CalendarDays, Search, Loader2, Camera } from 'lucide-react'
import { createLegacyMedicalRecord } from '@/app/(protected)/historias/actions'

interface Appointment {
  id: string
  fecha_hora_inicio: string
  estado: string
  motivo_consulta: string | null
  patients: {
    id: string
    nombre: string
    apellido: string
    cedula: string | null
  } | null
}

interface AppointmentPickerProps {
  appointments: Appointment[]
}

export function AppointmentPicker({ appointments }: AppointmentPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [loadingAppointmentId, setLoadingAppointmentId] = useState<string | null>(null)

  const handleLegacyClick = (appointmentId: string) => {
    setLoadingAppointmentId(appointmentId)
    startTransition(async () => {
      const result = await createLegacyMedicalRecord(appointmentId)
      if (result?.error) {
        alert(result.error)
        setLoadingAppointmentId(null)
      }
    })
  }

  // Debounce search query (300ms)
  useEffect(() => {
    if (searchQuery.length === 0) {
      setDebouncedQuery('')
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.toLowerCase())
      setIsSearching(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Filter appointments based on search query
  const filteredAppointments = useMemo(() => {
    if (!debouncedQuery) {
      return appointments
    }

    return appointments.filter((apt) => {
      const patient = apt.patients
      if (!patient) return false

      const fullName = `${patient.nombre} ${patient.apellido}`.toLowerCase()
      const cedula = (patient.cedula || '').toLowerCase()

      return fullName.includes(debouncedQuery) || cedula.includes(debouncedQuery)
    })
  }, [appointments, debouncedQuery])

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Citas Disponibles
        </CardTitle>
        <CardDescription>
          Citas sin historia clinica asignada
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o cedula del paciente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Results */}
        {filteredAppointments.length === 0 ? (
          <div className="text-center py-8">
            <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            {debouncedQuery ? (
              <>
                <h3 className="text-lg font-medium mb-2">No se encontraron citas</h3>
                <p className="text-muted-foreground mb-4">
                  No hay citas que coincidan con &quot;{debouncedQuery}&quot;
                </p>
                <Button variant="outline" onClick={() => setSearchQuery('')}>
                  Limpiar busqueda
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium mb-2">No hay citas disponibles</h3>
                <p className="text-muted-foreground mb-4">
                  Todas las citas ya tienen historia clinica o no hay citas registradas.
                </p>
                <Link href="/citas">
                  <Button>Ir a Citas</Button>
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            {debouncedQuery && (
              <p className="text-sm text-muted-foreground">
                {filteredAppointments.length} cita{filteredAppointments.length !== 1 ? 's' : ''} encontrada{filteredAppointments.length !== 1 ? 's' : ''}
              </p>
            )}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Cedula</TableHead>
                    <TableHead>Fecha Cita</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAppointments.map((apt) => (
                    <TableRow key={apt.id}>
                      <TableCell className="font-medium">
                        {apt.patients?.nombre} {apt.patients?.apellido}
                      </TableCell>
                      <TableCell>{apt.patients?.cedula || '-'}</TableCell>
                      <TableCell>{formatDate(apt.fecha_hora_inicio)}</TableCell>
                      <TableCell>{apt.estado}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {apt.motivo_consulta || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLegacyClick(apt.id)}
                            disabled={isPending && loadingAppointmentId === apt.id}
                          >
                            {isPending && loadingAppointmentId === apt.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Camera className="h-4 w-4 mr-1" />
                                Fotos
                              </>
                            )}
                          </Button>
                          <Link href={`/historias/nueva?appointment_id=${apt.id}`}>
                            <Button size="sm">Crear Historia</Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
