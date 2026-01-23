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
    cedula: patient.cedula,
    nombre: patient.nombre,
    apellido: patient.apellido,
    celular: patient.celular,
    email: patient.email ?? '',
    fecha_nacimiento: patient.fecha_nacimiento ?? '',
    direccion: patient.direccion ?? '',
    contacto_emergencia_nombre: patient.contacto_emergencia_nombre,
    contacto_emergencia_telefono: patient.contacto_emergencia_telefono,
    contacto_emergencia_parentesco: patient.contacto_emergencia_parentesco,
  }

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-600">
        <Link href="/pacientes" className="hover:text-gray-900">
          Pacientes
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/pacientes/${id}`} className="hover:text-gray-900">
          {patient.nombre} {patient.apellido}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Editar</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Editar Paciente</h1>
        <p className="mt-1 text-gray-600">
          Cedula: <span className="font-mono">{patient.cedula}</span>
          <span className="ml-2 text-xs text-amber-600">
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
