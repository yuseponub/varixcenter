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
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/pacientes" className="hover:text-foreground">
          Pacientes
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">
          {patient.nombre} {patient.apellido}
        </span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 rounded-xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-4">
          <span className="bg-gradient-primary flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-lg font-bold text-white uppercase">
            {patient.nombre?.[0]}
            {patient.apellido?.[0]}
          </span>
          <div>
            <h1 className="text-[19px] font-bold">
              {patient.nombre} {patient.apellido}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              CC <span className="font-mono">{patient.cedula}</span>
              {patient.celular && (
                <>
                  {' · '}
                  <span className="font-mono">{patient.celular}</span>
                </>
              )}
            </p>
          </div>
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
                  <dt className="text-sm font-medium text-muted-foreground">Nombre Completo</dt>
                  <dd className="mt-1 text-foreground">
                    {patient.nombre} {patient.apellido}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Cedula</dt>
                  <dd className="mt-1 font-mono text-foreground">{patient.cedula}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Celular</dt>
                  <dd className="mt-1 font-mono text-foreground">{patient.celular}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Email</dt>
                  <dd className="mt-1 text-foreground">
                    {patient.email || <span className="text-muted-foreground">No registrado</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Fecha de Nacimiento</dt>
                  <dd className="mt-1 text-foreground">
                    {patient.fecha_nacimiento ? (
                      new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(
                        new Date(patient.fecha_nacimiento)
                      )
                    ) : (
                      <span className="text-muted-foreground">No registrada</span>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-muted-foreground">Direccion</dt>
                  <dd className="mt-1 text-foreground">
                    {patient.direccion || <span className="text-muted-foreground">No registrada</span>}
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
                  <dt className="text-sm font-medium text-muted-foreground">Nombre</dt>
                  <dd className="mt-1 text-foreground">
                    {patient.contacto_emergencia_nombre}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Telefono</dt>
                  <dd className="mt-1 font-mono text-foreground">
                    {patient.contacto_emergencia_telefono}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Parentesco</dt>
                  <dd className="mt-1 text-foreground">
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
                  <dt className="text-sm font-medium text-muted-foreground">Fecha de Registro</dt>
                  <dd className="mt-1 text-foreground">
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    }).format(new Date(patient.created_at))}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Ultima Actualizacion</dt>
                  <dd className="mt-1 text-foreground">
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
