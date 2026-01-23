'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'

/**
 * Search input with debounce for patient search
 * Updates URL search params for server-side filtering
 */
export function PatientSearch() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Local state for immediate UI feedback
  const [query, setQuery] = useState(searchParams.get('q') ?? '')

  // Debounce search - update URL after 300ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (query) {
        params.set('q', query)
      } else {
        params.delete('q')
      }

      // Reset to page 1 when search changes
      params.delete('page')

      startTransition(() => {
        router.push(`/pacientes?${params.toString()}`)
      })
    }, 300)

    return () => clearTimeout(timer)
  }, [query, router, searchParams])

  return (
    <div className="relative">
      <Input
        type="search"
        placeholder="Buscar por cedula, nombre, apellido o celular..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-md"
      />
      {isPending && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </div>
      )}
    </div>
  )
}
