'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AlertItem } from './alert-item'
import { ResolveAlertDialog } from './resolve-alert-dialog'
import type { Alert } from '@/types/alerts'
import { Bell } from 'lucide-react'

interface AlertsWidgetProps {
  alerts: Alert[]
}

/**
 * Alerts Widget Component
 *
 * Dashboard widget displaying recent alerts with resolve functionality.
 * Shows empty state when no pending alerts.
 */
export function AlertsWidget({ alerts }: AlertsWidgetProps) {
  const router = useRouter()
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleResolve = (alert: Alert) => {
    setSelectedAlert(alert)
    setDialogOpen(true)
  }

  const handleResolved = () => {
    // Refresh the page to get updated alerts
    router.refresh()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Alertas Recientes
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No hay alertas pendientes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map(alert => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onResolve={handleResolve}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ResolveAlertDialog
        alert={selectedAlert}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onResolved={handleResolved}
      />
    </>
  )
}
