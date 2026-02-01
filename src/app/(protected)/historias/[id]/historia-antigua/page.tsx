import { notFound } from 'next/navigation'
import { getMedicalRecordById } from '@/lib/queries/medical-records'
import { getLegacyPhotosByMedicalRecord } from '@/lib/queries/legacy-photos'
import { HistoriaAntiguaClient } from './historia-antigua-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function HistoriaAntiguaPage({ params }: PageProps) {
  const { id } = await params

  const [record, photos] = await Promise.all([
    getMedicalRecordById(id),
    getLegacyPhotosByMedicalRecord(id),
  ])

  if (!record) {
    notFound()
  }

  return (
    <HistoriaAntiguaClient
      medicalRecordId={id}
      initialRecord={record}
      initialPhotos={photos}
    />
  )
}
