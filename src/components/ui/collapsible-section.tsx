'use client'

import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title: string
  icon?: React.ReactNode
  badge?: string
  children: React.ReactNode
  defaultOpen?: boolean
  hasContent?: boolean
  className?: string
}

/**
 * Collapsible section that opens automatically if hasContent is true
 */
export function CollapsibleSection({
  title,
  icon,
  badge,
  children,
  defaultOpen,
  hasContent = false,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? hasContent)

  // Update open state when hasContent changes
  useEffect(() => {
    if (hasContent && !isOpen) {
      setIsOpen(true)
    }
  }, [hasContent])

  return (
    <div className={cn('border rounded-lg bg-card', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/50 transition-colors"
      >
        {icon}
        <span className="font-medium">{title}</span>
        {badge && (
          <span className="text-xs text-muted-foreground ml-1">({badge})</span>
        )}
        <ChevronDown
          className={cn(
            'ml-auto h-5 w-5 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  )
}
