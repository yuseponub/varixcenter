/**
 * Notifications Table
 *
 * Displays list of SMS notifications with patient info and status.
 */
'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { NotificationStatusBadge } from './notification-status-badge'
import type { NotificationWithDetails } from '@/types/notifications'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'

interface NotificationsTableProps {
  notifications: NotificationWithDetails[]
}

export function NotificationsTable({ notifications }: NotificationsTableProps) {
  if (notifications.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No hay notificaciones registradas
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Paciente</TableHead>
            <TableHead>Telefono</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cita</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {notifications.map((notif) => (
            <TableRow key={notif.id}>
              <TableCell>
                <Link
                  href={`/pacientes/${notif.patient_id}`}
                  className="font-medium hover:underline"
                >
                  {notif.patients.nombre} {notif.patients.apellido}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-sm">
                {notif.telefono_destino}
              </TableCell>
              <TableCell>
                {notif.tipo_recordatorio === '24h' ? '24 horas' : '2 horas'}
              </TableCell>
              <TableCell>
                {format(
                  new Date(notif.appointments.fecha_hora_inicio),
                  "d 'de' MMMM, h:mm a",
                  { locale: es }
                )}
              </TableCell>
              <TableCell>
                <NotificationStatusBadge status={notif.estado} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {notif.enviado_at
                  ? format(new Date(notif.enviado_at), "d MMM, h:mm a", { locale: es })
                  : format(new Date(notif.created_at), "d MMM, h:mm a", { locale: es })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
