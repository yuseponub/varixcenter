import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPatientById } from '@/lib/queries/patients'
import { PatientForm } from '@/components/patients/patient-form'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditarPacientePage({ params }: PageProps) {
  const { id } = await params

  // Fetch patient data
  const patient = await getPatientById(id)

  if (!patient) {
    notFound()
  }

  // Convert database dates to form format (YYYY-MM-DD)
  const defaultValues = {
    cedula: patient.cedula ?? '',
    nombre: patient.nombre,
    apellido: patient.apellido,
    celular: patient.celular ?? '',
    email: patient.email ?? '',
    fecha_nacimiento: patient.fecha_nacimiento ?? '',
    direccion: patient.direccion ?? '',
    contacto_emergencia_nombre: patient.contacto_emergencia_nombre ?? undefined,
    contacto_emergencia_telefono: patient.contacto_emergencia_telefono ?? undefined,
    contacto_emergencia_parentesco: patient.contacto_emergencia_parentesco ?? undefined,
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/pacientes" className="hover:text-foreground">
          Pacientes
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/pacientes/${id}`} className="hover:text-foreground">
          {patient.nombre} {patient.apellido}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Editar</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold">Editar Paciente</h1>
        <p className="mt-1 text-muted-foreground">
          Cedula: <span className="font-mono">{patient.cedula}</span>
          <span className="ml-2 text-xs text-warning-foreground">
            (La cedula no puede ser modificada)
          </span>
        </p>
      </div>

      {/* Form */}
      <div className="max-w-3xl">
        <PatientForm
          mode="edit"
          patientId={id}
          defaultValues={defaultValues}
        />
      </div>
    </div>
  )
}
