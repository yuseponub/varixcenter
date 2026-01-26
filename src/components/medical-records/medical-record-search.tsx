'use client'

/**
 * Medical Record Search Component
 *
 * Search field that updates URL params for server-side filtering
 */

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function MedicalRecordSearch() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('search') || '')

  // Sync input with URL param
  useEffect(() => {
    setQuery(searchParams.get('search') || '')
  }, [searchParams])

  // Update URL with search param
  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())

    if (query.trim()) {
      params.set('search', query.trim())
    } else {
      params.delete('search')
    }

    // Reset to page 1 when searching
    params.delete('page')

    router.push(`/historias?${params.toString()}`)
  }, [query, searchParams, router])

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Clear search
  const handleClear = () => {
    setQuery('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('search')
    params.delete('page')
    router.push(`/historias?${params.toString()}`)
  }

  return (
    <div className="flex gap-2 w-full max-w-md">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar por nombre o cedula..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-10"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Button onClick={handleSearch}>
        Buscar
      </Button>
    </div>
  )
}
