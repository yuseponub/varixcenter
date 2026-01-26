import { createClient } from '@/lib/supabase/server'
import { getMedicalRecords } from '@/lib/queries/medical-records'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FileText, Eye, Edit, ChevronLeft, ChevronRight } from 'lucide-react'
import { MEDICAL_RECORD_STATUS_LABELS, MEDICAL_RECORD_STATUS_VARIANTS } from '@/types'
import { MedicalRecordSearch } from '@/components/medical-records'

interface PageProps {
  searchParams: Promise<{
    page?: string
    estado?: 'borrador' | 'completado'
    search?: string
  }>
}

export default async function HistoriasPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  const limit = 20

  const { records, total } = await getMedicalRecords({
    page,
    limit,
    estado: params.estado,
    search: params.search,
  })

  const totalPages = Math.ceil(total / limit)

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Historias Clinicas</h1>
          <p className="text-muted-foreground">
            Gestion de historias clinicas de pacientes
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buscar y Filtrar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <MedicalRecordSearch />

          {/* Status Filter */}
          <div className="flex gap-2">
            <Link href="/historias">
              <Button variant={!params.estado ? 'default' : 'outline'} size="sm">
                Todas
              </Button>
            </Link>
            <Link href="/historias?estado=borrador">
              <Button
                variant={params.estado === 'borrador' ? 'default' : 'outline'}
                size="sm"
              >
                Borradores
              </Button>
            </Link>
            <Link href="/historias?estado=completado">
              <Button
                variant={params.estado === 'completado' ? 'default' : 'outline'}
                size="sm"
              >
                Completadas
              </Button>
            </Link>
          </div>

          {/* Show active search */}
          {params.search && (
            <p className="text-sm text-muted-foreground">
              Mostrando resultados para: <strong>{params.search}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Records table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Historias ({total})
          </CardTitle>
          <CardDescription>
            Lista de historias clinicas registradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay historias clinicas</h3>
              <p className="text-muted-foreground mb-4">
                Las historias clinicas se crean desde las citas del paciente
              </p>
              <Link href="/citas">
                <Button>Ir a Citas</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Cedula</TableHead>
                      <TableHead>Fecha Cita</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Creada</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.patient?.nombre} {record.patient?.apellido}
                        </TableCell>
                        <TableCell>{record.patient?.cedula}</TableCell>
                        <TableCell>
                          {record.appointment?.fecha_hora_inicio
                            ? formatDate(record.appointment.fecha_hora_inicio)
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={MEDICAL_RECORD_STATUS_VARIANTS[record.estado]}>
                            {MEDICAL_RECORD_STATUS_LABELS[record.estado]}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(record.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/historias/${record.id}`}>
                              <Button variant="ghost" size="icon">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            {record.estado === 'borrador' && (
                              <Link href={`/historias/${record.id}/editar`}>
                                <Button variant="ghost" size="icon">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Pagina {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Link
                      href={`/historias?page=${page - 1}${params.estado ? `&estado=${params.estado}` : ''}`}
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link
                      href={`/historias?page=${page + 1}${params.estado ? `&estado=${params.estado}` : ''}`}
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={page >= totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
