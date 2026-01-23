import Link from 'next/link'
import { PatientForm } from '@/components/patients/patient-form'

export default function NuevoPacientePage() {
  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-600">
        <Link href="/pacientes" className="hover:text-gray-900">
          Pacientes
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Nuevo Paciente</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Registrar Nuevo Paciente</h1>
        <p className="mt-1 text-gray-600">
          Complete el formulario para registrar un nuevo paciente en el sistema.
        </p>
      </div>

      {/* Form */}
      <div className="max-w-3xl">
        <PatientForm mode="create" />
      </div>
    </div>
  )
}
