import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getMedicalRecordById,
  getQuotationByMedicalRecord,
  getProgressNotes,
  getDoctors,
} from '@/lib/queries/medical-records'
import { getLegacyPhotosByType } from '@/lib/queries/legacy-photos'
import { getPatientAttendance } from '@/lib/queries/attendances'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Edit,
  FileText,
  User,
  Stethoscope,
  Activity,
  Clock,
  Microscope,
  ClipboardList,
  Briefcase,
  Camera,
  ChevronDown,
  ScrollText,
  Info,
  AlertTriangle,
} from 'lucide-react'
import {
  MEDICAL_RECORD_STATUS_LABELS,
  MEDICAL_RECORD_STATUS_VARIANTS,
  CEAP_LABELS,
  CEAP_VARIANTS,
  SYMPTOM_LABELS,
  SIGN_LABELS,
  ONSET_LABELS,
  HISTORY_LABELS,
  VASCULAR_LAB_LABELS,
} from '@/types'
import type { CeapClassification } from '@/types'
import { LegacyPhotosGallery, MarkAttendedButton, PatientInfoCard, DoctorSelector } from '@/components/medical-records'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RecordTabs } from '@/components/medical-records/record-tabs'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function HistoriaDetailPage({ params }: PageProps) {
  const { id } = await params
  const record = await getMedicalRecordById(id)

  if (!record) {
    notFound()
  }

  // Get user role from JWT
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  let userRole = 'none'
  if (session?.access_token) {
    try {
      const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64').toString())
      userRole = payload.app_metadata?.role ?? 'none'
    } catch {
      userRole = 'none'
    }
  }

  const isMedico = userRole === 'medico' || userRole === 'admin'

  // Fetch data in parallel
  const [quotation, progressNotes, legacyPhotos, evolutionPhotos, attendance, doctors] = await Promise.all([
    getQuotationByMedicalRecord(id),
    getProgressNotes(id),
    getLegacyPhotosByType(id, 'historia'),
    getLegacyPhotosByType(id, 'evolucion'),
    record.patient?.id ? getPatientAttendance(record.patient.id) : Promise.resolve(null),
    getDoctors(),
  ])

  const hasLegacyPhotos = legacyPhotos.length > 0

  // Get programa_terapeutico_texto (cast as any since field may not be in types yet)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programaTerapeuticoTexto = ((record as any).programa_terapeutico_texto as string) || ''

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount)

  // Helper to render checkbox section
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCheckboxSection = (
    data: Record<string, any>,
    labels: Record<string, string>
  ) => {
    const checked = Object.entries(labels)
      .filter(([key]) => data[key] === true)
      .map(([, label]) => label)

    const otros = data.otros as string | undefined

    if (checked.length === 0 && !otros) {
      return <p className="text-muted-foreground text-sm">No registrado</p>
    }

    return (
      <div className="space-y-2">
        {checked.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {checked.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </div>
        )}
        {otros && (
          <p className="text-sm">
            <span className="font-medium">Otros:</span> {otros}
          </p>
        )}
      </div>
    )
  }

  // Digital content cards - used in both cases
  const DigitalContentCards = () => (
    <>
      {/* Patient Info - Editable Card */}
      {record.patient ? (
        <PatientInfoCard
          patientId={record.patient.id}
          patient={{
            nombre: record.patient.nombre,
            apellido: record.patient.apellido,
            cedula: record.patient.cedula,
            celular: record.patient.celular,
            fecha_nacimiento: record.patient.fecha_nacimiento,
          }}
          appointment={record.appointment ? {
            fecha_hora_inicio: record.appointment.fecha_hora_inicio,
            motivo_consulta: record.appointment.motivo_consulta,
          } : undefined}
          canEdit={isMedico}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Paciente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Paciente no encontrado</p>
          </CardContent>
        </Card>
      )}

      {/* Symptoms and Signs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Motivo de Consulta (Sintomas)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderCheckboxSection(record.sintomas, SYMPTOM_LABELS)}
          {record.sintomas.tiempo_evolucion && (
            <p className="text-sm">
              <span className="font-medium">Tiempo de evolucion:</span>{' '}
              {record.sintomas.tiempo_evolucion}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Examen Fisico (Signos)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderCheckboxSection(record.signos, SIGN_LABELS)}
        </CardContent>
      </Card>

      {/* Onset and History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Inicio Relacionado Con
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderCheckboxSection(record.inicio_relacionado, ONSET_LABELS)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Antecedentes Patologicos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderCheckboxSection(record.antecedentes, HISTORY_LABELS)}
          {record.antecedentes.observaciones && (
            <div className="pt-2 border-t">
              <p className="text-sm font-medium">Observaciones:</p>
              <p className="text-sm whitespace-pre-wrap">
                {record.antecedentes.observaciones}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vascular Lab */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Microscope className="h-5 w-5" />
            Laboratorio Vascular
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderCheckboxSection(record.laboratorio_vascular, VASCULAR_LAB_LABELS)}
          {record.laboratorio_vascular.hallazgos && (
            <div className="pt-2 border-t">
              <p className="text-sm font-medium">Hallazgos:</p>
              <p className="text-sm whitespace-pre-wrap">
                {record.laboratorio_vascular.hallazgos}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnosis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Diagnostico
            </div>
            <Link href={`/historias/${id}/diagrama`}>
              <Badge variant="outline" className="text-xs font-normal cursor-pointer hover:bg-muted">
                <Info className="h-3 w-3 mr-1" />
                Para editar ve a Dx y Evolucion
              </Badge>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {record.diagnostico ? (
            <p className="whitespace-pre-wrap">{record.diagnostico}</p>
          ) : (
            <p className="text-muted-foreground text-sm">No registrado</p>
          )}
        </CardContent>
      </Card>

      {/* CEAP Classification */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Clasificacion CEAP
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium mb-1">Pierna Izquierda</p>
              {record.ceap_pierna_izquierda ? (
                <Badge variant={CEAP_VARIANTS[record.ceap_pierna_izquierda as CeapClassification]}>
                  {CEAP_LABELS[record.ceap_pierna_izquierda as CeapClassification]}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Sin clasificar</span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Pierna Derecha</p>
              {record.ceap_pierna_derecha ? (
                <Badge variant={CEAP_VARIANTS[record.ceap_pierna_derecha as CeapClassification]}>
                  {CEAP_LABELS[record.ceap_pierna_derecha as CeapClassification]}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Sin clasificar</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Treatment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Programa Terapeutico
            </div>
            <Link href={`/historias/${id}/diagrama`}>
              <Badge variant="outline" className="text-xs font-normal cursor-pointer hover:bg-muted">
                <Info className="h-3 w-3 mr-1" />
                Para editar ve a Dx y Evolucion
              </Badge>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Programa Terapeutico Texto */}
          {programaTerapeuticoTexto && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Notas del Programa:</p>
              <p className="text-sm whitespace-pre-wrap">{programaTerapeuticoTexto}</p>
            </div>
          )}

          {/* Treatments List */}
          {record.treatments && record.treatments.length > 0 ? (
            <div className="space-y-2">
              {record.treatments.map((treatment) => (
                <div
                  key={treatment.id}
                  className="flex justify-between items-center p-2 bg-muted rounded"
                >
                  <span>{treatment.nombre}</span>
                  <span className="font-medium">
                    {formatCurrency(treatment.precio_base)}
                  </span>
                </div>
              ))}
              <Separator className="my-2" />
              <div className="flex justify-between items-center font-bold">
                <span>Total estimado:</span>
                <span>
                  {formatCurrency(
                    record.treatments.reduce((sum, t) => sum + t.precio_base, 0)
                  )}
                </span>
              </div>
            </div>
          ) : !programaTerapeuticoTexto && (
            <p className="text-muted-foreground text-sm">
              No se han seleccionado tratamientos
            </p>
          )}

          {quotation && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm">
                <span className="font-medium">Cotizacion guardada:</span>{' '}
                {formatCurrency(quotation.total)}
              </p>
              <Link href={`/historias/${id}/cotizacion`}>
                <Button variant="link" className="px-0">
                  Ver cotizacion completa
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evolution Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              Evolucion
              {(evolutionPhotos.length > 0 || progressNotes.length > 0) && (
                <Badge variant="secondary" className="ml-2">
                  {evolutionPhotos.length > 0 && `${evolutionPhotos.length} foto${evolutionPhotos.length !== 1 ? 's' : ''}`}
                  {evolutionPhotos.length > 0 && progressNotes.length > 0 && ', '}
                  {progressNotes.length > 0 && `${progressNotes.length} nota${progressNotes.length !== 1 ? 's' : ''}`}
                </Badge>
              )}
            </div>
            <Link href={`/historias/${id}/diagrama`}>
              <Badge variant="outline" className="text-xs font-normal cursor-pointer hover:bg-muted">
                <Info className="h-3 w-3 mr-1" />
                Para editar ve a Dx y Evolucion
              </Badge>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Evolution Photos */}
          {evolutionPhotos.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Fotos de Evolucion:</p>
              <LegacyPhotosGallery tipo="evolucion" photos={evolutionPhotos} />
            </div>
          )}

          {/* Progress Notes (read-only list) */}
          {progressNotes.length > 0 ? (
            <div>
              <p className="text-sm font-medium mb-2">Notas de Evolucion:</p>
              <div className="space-y-2">
                {progressNotes.map((note) => (
                  <div key={note.id} className="p-3 bg-muted rounded text-sm">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{note.created_by_user?.nombre || 'Usuario'}</span>
                      <span>
                        {new Date(note.created_at).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{note.nota}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : evolutionPhotos.length === 0 && (
            <p className="text-muted-foreground text-sm">No hay registros de evolucion</p>
          )}
        </CardContent>
      </Card>

      {/* Audit Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Informacion de Registro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Creado por</p>
              <p className="font-medium">
                {record.created_by_user ? (
                  <>
                    {record.created_by_user.nombre && record.created_by_user.apellido
                      ? `${record.created_by_user.nombre} ${record.created_by_user.apellido}`
                      : record.created_by_user.email || 'Usuario desconocido'}
                    {record.created_by_user.role && (
                      <Badge variant="outline" className="ml-2 text-xs capitalize">
                        {record.created_by_user.role}
                      </Badge>
                    )}
                  </>
                ) : (
                  'No registrado'
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha de creacion</p>
              <p className="font-medium">{formatDate(record.created_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Medico asignado</p>
              <DoctorSelector
                medicalRecordId={id}
                currentDoctorId={record.doctor?.id || null}
                doctors={doctors}
                canEdit={isMedico}
              />
            </div>
            <div>
              <p className="text-muted-foreground">Ultima actualizacion</p>
              <p className="font-medium">{formatDate(record.updated_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/historias"
            className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Historias
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <FileText className="h-6 w-6" />
            Historia Clinica
            <Badge variant={MEDICAL_RECORD_STATUS_VARIANTS[record.estado]}>
              {MEDICAL_RECORD_STATUS_LABELS[record.estado]}
            </Badge>
          </h1>
          <p className="text-muted-foreground">
            {record.patient?.nombre} {record.patient?.apellido} - CC: {record.patient?.cedula}
          </p>
        </div>
        <div className="flex gap-2 items-start">
          {isMedico && record.patient?.id && (
            <MarkAttendedButton
              patientId={record.patient.id}
              initialAttendance={attendance}
            />
          )}
          <Link href={`/historias/${id}/historia-antigua`}>
            <Button variant="outline">
              <Camera className="mr-2 h-4 w-4" />
              {hasLegacyPhotos ? 'Gestionar Fotos' : 'Añadir Historia Antigua'}
            </Button>
          </Link>
          {record.estado === 'borrador' && (
            <Link href={`/historias/${id}/editar`}>
              <Button>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Alert for missing doctor */}
      {!record.doctor && (
        <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 text-yellow-900">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Medico no asignado</AlertTitle>
          <AlertDescription className="text-yellow-700">
            Esta historia clinica no tiene un medico asignado. Asigne un medico en la seccion &quot;Informacion de Registro&quot; para que aparezca en el Plan de Tratamiento.
          </AlertDescription>
        </Alert>
      )}

      {/* Navigation Tabs */}
      <RecordTabs recordId={id} isReadOnly={record.estado === 'completado'} />

      {/* Legacy Photos Section - shown at top when photos exist */}
      {hasLegacyPhotos && (
        <LegacyPhotosGallery
          tipo="historia"
          photos={legacyPhotos}
        />
      )}

      {/* Digital Content - in collapsible when legacy photos exist, otherwise show directly */}
      {hasLegacyPhotos ? (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors list-none [&::-webkit-details-marker]:hidden">
            <FileText className="h-5 w-5" />
            <span className="font-medium">Ver Historia Digital</span>
            <span className="text-muted-foreground text-sm ml-2">(datos del formulario)</span>
            <ChevronDown className="ml-auto h-5 w-5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-6 mt-4">
            <DigitalContentCards />
          </div>
        </details>
      ) : (
        <DigitalContentCards />
      )}
    </div>
  )
}
