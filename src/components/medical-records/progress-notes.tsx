'use client'

import { useState, useEffect, useCallback } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScrollText, Plus, Loader2, AlertTriangle, User, Calendar, Trash2, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { addProgressNote, type ProgressNoteActionState } from '@/app/(protected)/historias/actions'
import { deleteProgressNote, updateProgressNote } from '@/app/(protected)/historias/[id]/diagrama/actions'
import type { ProgressNoteWithDetails } from '@/types'

interface ProgressNotesProps {
  medicalRecordId: string
  notes: ProgressNoteWithDetails[]
  onNoteAdded?: () => void
}

/**
 * Progress notes component
 * Shows list of notes and form to add new ones. Supports inline editing.
 */
export function ProgressNotes({
  medicalRecordId,
  notes: initialNotes,
  onNoteAdded,
}: ProgressNotesProps) {
  const [showForm, setShowForm] = useState(false)
  const [nota, setNota] = useState('')
  const [notes, setNotes] = useState(initialNotes)

  // Edit state: noteId -> draft text (null = not editing)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [state, formAction, isPending] = useActionState<ProgressNoteActionState | null, FormData>(
    addProgressNote,
    null
  )

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!confirm('¿Eliminar esta nota?')) return

    const result = await deleteProgressNote(noteId, medicalRecordId)
    if (result.success) {
      setNotes(prev => prev.filter(n => n.id !== noteId))
      toast.success('Nota eliminada')
    } else {
      toast.error(result.error || 'Error al eliminar')
    }
  }, [medicalRecordId])

  const handleStartEdit = useCallback((noteId: string, currentText: string) => {
    setEditingId(noteId)
    setEditDraft(currentText)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditDraft('')
  }, [])

  const handleSaveEdit = useCallback(async (noteId: string) => {
    setIsSavingEdit(true)
    const result = await updateProgressNote(noteId, medicalRecordId, editDraft)
    setIsSavingEdit(false)

    if (result.success) {
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, nota: editDraft.trim() } : n))
      setEditingId(null)
      setEditDraft('')
      toast.success('Nota actualizada')
    } else {
      toast.error(result.error || 'Error al guardar')
    }
  }, [medicalRecordId, editDraft])

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
              Evolucion
            </CardTitle>
            <CardDescription>
              Registro de evolucion del paciente
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
              placeholder="Escriba la nota de evolucion..."
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
                disabled={isPending || nota.trim().length < 3}
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
            No hay registros de evolucion
          </p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-4 border rounded-lg bg-background group"
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
                    {editingId !== note.id && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(note.id, note.nota)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity ml-2"
                          title="Editar nota"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                          title="Eliminar nota"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {note.appointment && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Cita del {formatDate(note.appointment.fecha_hora_inicio)}
                    {note.appointment.motivo_consulta && ` - ${note.appointment.motivo_consulta}`}
                  </p>
                )}

                {editingId === note.id ? (
                  <div className="space-y-2 mt-1">
                    <Textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={4}
                      disabled={isSavingEdit}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        disabled={isSavingEdit}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSaveEdit(note.id)}
                        disabled={isSavingEdit || editDraft.trim().length < 3}
                      >
                        {isSavingEdit ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{note.nota}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
