'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Check, X, Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { updatePaymentNota } from '@/app/(protected)/pagos/actions'

interface PaymentNotaProps {
  paymentId: string
  initialNota: string | null
  disabled?: boolean
}

export function PaymentNota({ paymentId, initialNota, disabled }: PaymentNotaProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [nota, setNota] = useState(initialNota || '')
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleStartEdit = useCallback(() => {
    setDraft(nota)
    setIsEditing(true)
  }, [nota])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setDraft('')
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    const result = await updatePaymentNota(paymentId, draft || null)
    setIsSaving(false)

    if (result.success) {
      setNota(draft.trim())
      setIsEditing(false)
      toast.success('Nota actualizada')
    } else {
      toast.error(result.error || 'Error al guardar')
    }
  }, [paymentId, draft])

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Nota
          </CardTitle>
          {!disabled && !isEditing && (
            <Button variant="ghost" size="sm" onClick={handleStartEdit}>
              <Pencil className="h-4 w-4 mr-1" />
              {nota ? 'Editar' : 'Agregar nota'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Descripcion o comentario del pago..."
              rows={3}
              disabled={isSaving}
              maxLength={1000}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        ) : nota ? (
          <p className="text-sm whitespace-pre-wrap">{nota}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Sin nota</p>
        )}
      </CardContent>
    </Card>
  )
}
