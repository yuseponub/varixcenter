import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMedicalRecordById, getActiveServices } from '@/lib/queries/medical-records'
import { MedicalRecordForm } from '@/components/medical-records'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditarHistoriaPage({ params }: PageProps) {
  const { id } = await params

  // Get current user and role
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const userRole = (roleData?.role as 'admin' | 'medico' | 'enfermera' | 'secretaria') || 'secretaria'

  // Check if user can edit medical records
  if (!['admin', 'medico', 'enfermera'].includes(userRole)) {
    return (
      <div className="container mx-auto py-6 max-w-4xl">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Acceso Denegado</AlertTitle>
          <AlertDescription>
            Solo medicos y enfermeras pueden editar historias clinicas.
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Link href={`/historias/${id}`}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Fetch medical record
  const record = await getMedicalRecordById(id)

  if (!record) {
    notFound()
  }

  // Check if record can be edited (only drafts)
  if (record.estado === 'completado') {
    return (
      <div className="container mx-auto py-6 max-w-4xl">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Historia completada</AlertTitle>
          <AlertDescription>
            Esta historia clinica ya ha sido completada y no puede ser editada.
            Solo se pueden agregar notas de evolucion.
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Link href={`/historias/${id}`}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Ver Historia
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Get services for treatment selection
  const services = await getActiveServices()

  // Prepare patient data for form
  const patientData = record.patient ? {
    id: record.patient.id,
    nombre: record.patient.nombre,
    apellido: record.patient.apellido,
    cedula: record.patient.cedula,
    fecha_nacimiento: record.patient.fecha_nacimiento,
    telefono: record.patient.celular,
    email: record.patient.email,
    direccion: record.patient.direccion,
    sexo: null, // Sexo not in patients table
  } : {
    id: record.patient_id,
    nombre: 'Paciente',
    apellido: '',
    cedula: '',
    fecha_nacimiento: null,
    telefono: null,
    email: null,
    direccion: null,
    sexo: null,
  }

  // Prepare appointment data for form
  const appointmentData = record.appointment ? {
    id: record.appointment.id,
    fecha_hora_inicio: record.appointment.fecha_hora_inicio,
    motivo_consulta: record.appointment.motivo_consulta,
  } : {
    id: record.appointment_id,
    fecha_hora_inicio: record.created_at,
    motivo_consulta: null,
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="mb-6">
        <Link
          href={`/historias/${id}`}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a Historia
        </Link>
        <h1 className="text-2xl font-bold mt-4">Editar Historia Clinica</h1>
        <p className="text-muted-foreground">
          Modificar historia clinica del paciente
        </p>
      </div>

      <MedicalRecordForm
        mode="edit"
        patientData={patientData}
        appointmentData={appointmentData}
        doctorId={record.doctor_id}
        services={services}
        initialData={record}
        userRole={userRole as 'admin' | 'medico' | 'enfermera'}
      />
    </div>
  )
}
