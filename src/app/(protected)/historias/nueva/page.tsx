import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAppointmentById } from '@/lib/queries/appointments'
import { getPatientById } from '@/lib/queries/patients'
import { getMedicalRecordByAppointment, getActiveServices } from '@/lib/queries/medical-records'
import { MedicalRecordForm, AppointmentPicker } from '@/components/medical-records'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{
    appointment_id?: string
  }>
}

export default async function NuevaHistoriaPage({ searchParams }: PageProps) {
  const params = await searchParams
  const appointmentId = params.appointment_id

  // If no appointment_id, show appointment picker
  if (!appointmentId) {
    const supabase = await createClient()

    // Get appointments that don't have a medical record yet
    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select(`
        id,
        fecha_hora_inicio,
        estado,
        motivo_consulta,
        patients:patient_id (id, nombre, apellido, cedula)
      `)
      .in('estado', ['programada', 'confirmada', 'en_sala', 'en_atencion', 'completada'])
      .order('fecha_hora_inicio', { ascending: false })
      .limit(50)

    if (aptError) {
      console.error('Error fetching appointments:', aptError)
    }
    console.log('Appointments found:', appointments?.length, 'Error:', aptError)

    // Filter out appointments that already have a medical record
    const { data: existingRecords } = await (supabase as any)
      .from('medical_records')
      .select('appointment_id')

    const usedAppointmentIds = new Set(
      (existingRecords || []).map((r: { appointment_id: string }) => r.appointment_id)
    )

    const availableAppointments = (appointments || []).filter(
      (a: { id: string }) => !usedAppointmentIds.has(a.id)
    )

    return (
      <div className="container mx-auto py-6 max-w-4xl">
        <div className="mb-6">
          <Link href="/historias" className="flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Historias
          </Link>
          <h1 className="text-2xl font-bold mt-4">Nueva Historia Clinica</h1>
          <p className="text-muted-foreground">
            Seleccione la cita para crear la historia clinica
          </p>
        </div>

        <AppointmentPicker appointments={availableAppointments} />
      </div>
    )
  }

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

  // Check if user can create medical records
  if (!['admin', 'medico', 'enfermera'].includes(userRole)) {
    return (
      <div className="container mx-auto py-6 max-w-4xl">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Acceso Denegado</AlertTitle>
          <AlertDescription>
            Solo medicos y enfermeras pueden crear historias clinicas.
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Link href="/historias">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Fetch appointment data
  const appointment = await getAppointmentById(appointmentId)

  if (!appointment) {
    notFound()
  }

  // Check if medical record already exists for this appointment
  // If it does, redirect to the existing record instead of showing an error
  const existingRecord = await getMedicalRecordByAppointment(appointmentId)

  if (existingRecord) {
    redirect(`/historias/${existingRecord.id}`)
  }

  // Get patient data
  const patient = await getPatientById(appointment.patient_id)

  if (!patient) {
    notFound()
  }

  // Get services for treatment selection
  const services = await getActiveServices()

  // Prepare patient data for form
  const patientData = {
    id: patient.id,
    nombre: patient.nombre,
    apellido: patient.apellido,
    cedula: patient.cedula,
    fecha_nacimiento: patient.fecha_nacimiento,
    telefono: patient.celular,
    email: patient.email,
    direccion: patient.direccion,
    sexo: null, // Sexo not in patients table
  }

  // Prepare appointment data for form
  const appointmentData = {
    id: appointment.id,
    fecha_hora_inicio: appointment.fecha_hora_inicio,
    motivo_consulta: appointment.motivo_consulta,
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="mb-6">
        <Link href="/citas" className="flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a Citas
        </Link>
        <h1 className="text-2xl font-bold mt-4">Nueva Historia Clinica</h1>
        <p className="text-muted-foreground">
          Crear historia clinica para el paciente desde la cita
        </p>
      </div>

      <MedicalRecordForm
        mode="create"
        patientData={patientData}
        appointmentData={appointmentData}
        doctorId={appointment.doctor_id}
        services={services}
        userRole={userRole as 'admin' | 'medico' | 'enfermera'}
      />
    </div>
  )
}
