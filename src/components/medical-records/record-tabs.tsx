'use client'

/**
 * Medical Record Navigation Tabs
 *
 * Provides seamless navigation between Historia, Diagnóstico, and Cotización
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FileText, Pencil, Receipt } from 'lucide-react'

interface RecordTabsProps {
  /** Medical record ID */
  recordId: string
  /** Whether the record is read-only (completed) */
  isReadOnly?: boolean
}

const tabs = [
  {
    name: 'Historia',
    href: (id: string) => `/historias/${id}`,
    icon: FileText,
    match: (path: string, id: string) => path === `/historias/${id}`,
  },
  {
    name: 'Diagnostico',
    href: (id: string) => `/historias/${id}/diagrama`,
    icon: Pencil,
    match: (path: string, id: string) => path === `/historias/${id}/diagrama`,
  },
  {
    name: 'Cotizacion',
    href: (id: string) => `/historias/${id}/cotizacion`,
    icon: Receipt,
    match: (path: string, id: string) => path === `/historias/${id}/cotizacion`,
  },
]

export function RecordTabs({ recordId, isReadOnly }: RecordTabsProps) {
  const pathname = usePathname()

  return (
    <div className="border-b">
      <nav className="flex gap-1" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.match(pathname, recordId)
          const Icon = tab.icon

          return (
            <Link
              key={tab.name}
              href={tab.href(recordId)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.name}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
