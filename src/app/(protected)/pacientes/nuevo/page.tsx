import Link from 'next/link'
import { PatientForm } from '@/components/patients/patient-form'

export default function NuevoPacientePage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/pacientes" className="hover:text-foreground">
          Pacientes
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Nuevo Paciente</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold">Registrar Nuevo Paciente</h1>
        <p className="mt-1 text-muted-foreground">
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
