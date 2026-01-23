'use client'

import { useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Patient = {
  id: string
  cedula: string
  nombre: string
  apellido: string
  celular: string
  created_at: string
}

interface PatientTableProps {
  data: Patient[]
}

const columns: ColumnDef<Patient>[] = [
  {
    accessorKey: 'cedula',
    header: 'Cedula',
    cell: ({ row }) => (
      <span className="font-mono">{row.getValue('cedula')}</span>
    ),
  },
  {
    accessorKey: 'nombre',
    header: 'Nombre',
  },
  {
    accessorKey: 'apellido',
    header: 'Apellido',
  },
  {
    accessorKey: 'celular',
    header: 'Celular',
    cell: ({ row }) => (
      <span className="font-mono">{row.getValue('celular')}</span>
    ),
  },
  {
    accessorKey: 'created_at',
    header: 'Registrado',
    cell: ({ row }) => {
      const date = new Date(row.getValue('created_at'))
      return new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'medium',
      }).format(date)
    },
  },
]

/**
 * Patient data table with sorting and row click navigation
 */
export function PatientTable({ data }: PatientTableProps) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  })

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {header.isPlaceholder ? null : (
                    <div className="flex items-center gap-2">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {{
                        asc: ' ^',
                        desc: ' v',
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => router.push(`/pacientes/${row.original.id}`)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No se encontraron pacientes
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
