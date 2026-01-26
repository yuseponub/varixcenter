'use client'

import { useState, useEffect, useCallback } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScrollText, Plus, Loader2, AlertTriangle, User, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { addProgressNote, type ProgressNoteActionState } from '@/app/(protected)/historias/actions'
import type { ProgressNoteWithDetails } from '@/types'

interface ProgressNotesProps {
  medicalRecordId: string
  notes: ProgressNoteWithDetails[]
  onNoteAdded?: () => void
}

/**
 * Progress notes component
 * Shows list of notes and form to add new ones
 */
export function ProgressNotes({
  medicalRecordId,
  notes,
  onNoteAdded,
}: ProgressNotesProps) {
  const [showForm, setShowForm] = useState(false)
  const [nota, setNota] = useState('')

  const [state, formAction, isPending] = useActionState<ProgressNoteActionState | null, FormData>(
    addProgressNote,
    null
  )

  // Handle success/error
  useEffect(() => {
    if (state?.success) {
      toast.success('Nota agregada exitosamente')
      setNota('')
      setShowForm(false)
      onNoteAdded?.()
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state, onNoteAdded])

  // Handle form submission
  const handleSubmit = useCallback(
    (formData: FormData) => {
      formData.set('medical_record_id', medicalRecordId)
      formData.set('nota', nota)
      formAction(formData)
    },
    [medicalRecordId, nota, formAction]
  )

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              Notas de Evolucion
            </CardTitle>
            <CardDescription>
              Registro de seguimiento del paciente
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar Nota
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add note form */}
        {showForm && (
          <form action={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/50">
            {state?.error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Escriba la nota de evolucion (minimo 10 caracteres)..."
              rows={4}
              disabled={isPending}
            />
            {state?.errors?.nota && (
              <p className="text-sm text-red-500">{state.errors.nota[0]}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false)
                  setNota('')
                }}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || nota.length < 10}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Guardar Nota
              </Button>
            </div>
          </form>
        )}

        {/* Notes list */}
        {notes.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No hay notas de evolucion registradas
          </p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-4 border rounded-lg bg-background"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>
                      {note.created_by_user?.nombre
                        ? `${note.created_by_user.nombre} ${note.created_by_user.apellido || ''}`
                        : note.created_by_user?.email || 'Usuario'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(note.created_at)}</span>
                  </div>
                </div>
                {note.appointment && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Cita del {formatDate(note.appointment.fecha_hora_inicio)}
                    {note.appointment.motivo_consulta && ` - ${note.appointment.motivo_consulta}`}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap">{note.nota}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
