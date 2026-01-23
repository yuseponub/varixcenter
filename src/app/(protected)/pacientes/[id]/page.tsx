import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPatientById, getPatientTimeline } from '@/lib/queries/patients'
import { PatientTimeline } from '@/components/patients/patient-timeline'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PacienteDetailPage({ params }: PageProps) {
  const { id } = await params

  // Fetch patient and timeline data in parallel
  const [patient, timelineEvents] = await Promise.all([
    getPatientById(id),
    getPatientTimeline(id),
  ])

  if (!patient) {
    notFound()
  }

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-600">
        <Link href="/pacientes" className="hover:text-gray-900">
          Pacientes
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">
          {patient.nombre} {patient.apellido}
        </span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {patient.nombre} {patient.apellido}
          </h1>
          <p className="mt-1 text-gray-600">
            Cedula: <span className="font-mono">{patient.cedula}</span>
          </p>
        </div>
        <Link href={`/pacientes/${id}/editar`}>
          <Button variant="outline">Editar Paciente</Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Patient info */}
        <div className="space-y-6 lg:col-span-2">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle>Informacion Personal</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Nombre Completo</dt>
                  <dd className="mt-1 text-gray-900">
                    {patient.nombre} {patient.apellido}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Cedula</dt>
                  <dd className="mt-1 font-mono text-gray-900">{patient.cedula}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Celular</dt>
                  <dd className="mt-1 font-mono text-gray-900">{patient.celular}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-gray-900">
                    {patient.email || <span className="text-gray-400">No registrado</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Fecha de Nacimiento</dt>
                  <dd className="mt-1 text-gray-900">
                    {patient.fecha_nacimiento ? (
                      new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(
                        new Date(patient.fecha_nacimiento)
                      )
                    ) : (
                      <span className="text-gray-400">No registrada</span>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Direccion</dt>
                  <dd className="mt-1 text-gray-900">
                    {patient.direccion || <span className="text-gray-400">No registrada</span>}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Emergency Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Contacto de Emergencia</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Nombre</dt>
                  <dd className="mt-1 text-gray-900">
                    {patient.contacto_emergencia_nombre}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Telefono</dt>
                  <dd className="mt-1 font-mono text-gray-900">
                    {patient.contacto_emergencia_telefono}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Parentesco</dt>
                  <dd className="mt-1 text-gray-900">
                    {patient.contacto_emergencia_parentesco}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Registration Info */}
          <Card>
            <CardHeader>
              <CardTitle>Informacion del Registro</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Fecha de Registro</dt>
                  <dd className="mt-1 text-gray-900">
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    }).format(new Date(patient.created_at))}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Ultima Actualizacion</dt>
                  <dd className="mt-1 text-gray-900">
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    }).format(new Date(patient.updated_at))}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Timeline */}
        <div>
          <PatientTimeline events={timelineEvents} />
        </div>
      </div>
    </div>
  )
}
