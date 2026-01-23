import Link from 'next/link'
import { Suspense } from 'react'
import { searchPatients } from '@/lib/queries/patients'
import { PatientSearch } from '@/components/patients/patient-search'
import { PatientTable } from '@/components/patients/patient-table'
import { Button } from '@/components/ui/button'

interface PageProps {
  searchParams: Promise<{ q?: string }>
}

async function PatientList({ query }: { query: string }) {
  const patients = await searchPatients(query)

  return <PatientTable data={patients} />
}

export default async function PacientesPage({ searchParams }: PageProps) {
  const { q = '' } = await searchParams

  return (
    <div className="container mx-auto py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pacientes</h1>
        <Link href="/pacientes/nuevo">
          <Button>Nuevo Paciente</Button>
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6">
        <PatientSearch />
      </div>

      {/* Results */}
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          </div>
        }
      >
        <PatientList query={q} />
      </Suspense>
    </div>
  )
}
