import { getUnreadAlertCount } from '@/lib/queries/alerts'
import { Badge } from '@/components/ui/badge'
import { Bell } from 'lucide-react'

/**
 * Alert Badge Component (Server Component)
 *
 * Displays a Bell icon with unread alert count badge.
 * If count is 0, shows Bell without badge.
 * If count > 9, shows "9+".
 */
export async function AlertBadge() {
  const count = await getUnreadAlertCount()

  return (
    <div className="relative inline-flex">
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full"
        >
          {count > 9 ? '9+' : count}
        </Badge>
      )}
    </div>
  )
}
