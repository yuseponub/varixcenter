'use client'

import { useActionState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sendReconciliationEmailAction, type SendReconciliationState } from './actions'

export function SendEmailButton({ fecha }: { fecha: string }) {
  const [state, action, pending] = useActionState<SendReconciliationState | null, FormData>(
    sendReconciliationEmailAction,
    null
  )

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="fecha" value={fecha} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
        Enviar por correo
      </Button>
      {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
      {state?.success && <span className="text-sm text-success-foreground">{state.message}</span>}
    </form>
  )
}
