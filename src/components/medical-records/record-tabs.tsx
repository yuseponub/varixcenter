'use client'

/**
 * Medical Record Navigation Tabs
 *
 * Provides navigation between Historia, Diagnóstico, Evolución, Plan de Tratamiento, and Consentimiento
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FileText, Pencil, ClipboardList, TrendingUp, FileCheck } from 'lucide-react'

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
    match: (path: string, id: string) => path === `/historias/${id}` || path === `/historias/${id}/historia-antigua` || path === `/historias/${id}/ver-digital`,
  },
  {
    name: 'Plan de Tratamiento',
    href: (id: string) => `/historias/${id}/cotizacion`,
    icon: ClipboardList,
    match: (path: string, id: string) => path === `/historias/${id}/cotizacion`,
  },
  {
    name: 'Dx y Evolucion',
    href: (id: string) => `/historias/${id}/diagrama`,
    icon: Pencil,
    match: (path: string, id: string) => path === `/historias/${id}/diagrama` || path === `/historias/${id}/evolucion`,
  },
  {
    name: 'Consentimiento',
    href: (id: string) => `/historias/${id}/consentimiento`,
    icon: FileCheck,
    match: (path: string, id: string) => path === `/historias/${id}/consentimiento`,
  },
]

export function RecordTabs({ recordId, isReadOnly }: RecordTabsProps) {
  const pathname = usePathname()

  return (
    <div className="border-b overflow-x-auto">
      <nav className="flex gap-1 min-w-max" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.match(pathname, recordId)
          const Icon = tab.icon

          return (
            <Link
              key={tab.name}
              href={tab.href(recordId)}
              className={cn(
                'flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
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
