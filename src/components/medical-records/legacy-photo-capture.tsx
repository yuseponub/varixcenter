'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Camera, Trash2, ZoomIn, Loader2, Plus, Upload, X } from 'lucide-react'
import { createLegacyPhotoUploadUrl } from '@/lib/storage/receipts'
import { createLegacyPhoto, deleteLegacyPhoto } from '@/lib/queries/legacy-photos'
import type { LegacyPhotoType, LegacyHistoryPhotoWithUrl } from '@/types'
import { LEGACY_PHOTO_TYPE_LABELS } from '@/types'

interface PendingPhoto {
  id: string
  file: File
  preview: string
}

interface LegacyPhotoCaptureProps {
  medicalRecordId: string
  tipo: LegacyPhotoType
  existingPhotos: LegacyHistoryPhotoWithUrl[]
  onPhotoAdded?: () => void
  onPhotoDeleted?: () => void
}

export function LegacyPhotoCapture({
  medicalRecordId,
  tipo,
  existingPhotos,
  onPhotoAdded,
  onPhotoDeleted,
}: LegacyPhotoCaptureProps) {
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<LegacyHistoryPhotoWithUrl | null>(null)
  const [selectedPending, setSelectedPending] = useState<PendingPhoto | null>(null)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file selection (from native camera)
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Create preview URL
    const preview = URL.createObjectURL(file)
    const id = `pending-${Date.now()}`

    setPendingPhotos(prev => [...prev, { id, file, preview }])
    setError(null)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Trigger native camera
  const openCamera = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Remove pending photo
  const removePendingPhoto = useCallback((id: string) => {
    setPendingPhotos(prev => {
      const photo = prev.find(p => p.id === id)
      if (photo) {
        URL.revokeObjectURL(photo.preview)
      }
      return prev.filter(p => p.id !== id)
    })
    setSelectedPending(null)
  }, [])

  // Upload all pending photos
  const uploadAllPhotos = useCallback(async () => {
    if (pendingPhotos.length === 0) return

    setIsUploading(true)
    setError(null)
    setUploadProgress(0)

    const total = pendingPhotos.length
    let uploaded = 0

    try {
      for (const pending of pendingPhotos) {
        // Get upload URL
        const uploadResult = await createLegacyPhotoUploadUrl(medicalRecordId, tipo)

        if ('error' in uploadResult) {
          throw new Error(uploadResult.error)
        }

        // Upload to storage
        const uploadResponse = await fetch(uploadResult.signedUrl, {
          method: 'PUT',
          body: pending.file,
          headers: {
            'Content-Type': pending.file.type || 'image/jpeg',
          },
        })

        if (!uploadResponse.ok) {
          throw new Error('Error al subir la imagen')
        }

        // Create database record
        const photo = await createLegacyPhoto({
          medical_record_id: medicalRecordId,
          tipo,
          storage_path: uploadResult.path,
        })

        if (!photo) {
          throw new Error('Error al guardar la referencia de la imagen')
        }

        // Update progress
        uploaded++
        setUploadProgress(Math.round((uploaded / total) * 100))

        // Revoke preview URL
        URL.revokeObjectURL(pending.preview)
      }

      // Clear pending photos
      setPendingPhotos([])

      // Notify parent
      onPhotoAdded?.()
    } catch (err) {
      console.error('Error uploading photos:', err)
      setError(err instanceof Error ? err.message : 'Error al subir las fotos')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }, [pendingPhotos, medicalRecordId, tipo, onPhotoAdded])

  // Delete existing photo
  const handleDeletePhoto = useCallback(async (photoId: string) => {
    setDeletingPhotoId(photoId)
    try {
      const success = await deleteLegacyPhoto(photoId)
      if (success) {
        onPhotoDeleted?.()
      } else {
        setError('Error al eliminar la foto')
      }
    } catch (err) {
      console.error('Error deleting photo:', err)
      setError('Error al eliminar la foto')
    } finally {
      setDeletingPhotoId(null)
    }
  }, [onPhotoDeleted])

  const hasPendingPhotos = pendingPhotos.length > 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4" />
          {LEGACY_PHOTO_TYPE_LABELS[tipo]}
          {hasPendingPhotos && (
            <span className="text-sm font-normal text-muted-foreground">
              ({pendingPhotos.length} pendiente{pendingPhotos.length !== 1 ? 's' : ''})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hidden file input - triggers native camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Pending photos preview */}
        {hasPendingPhotos && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg border-2 border-dashed">
            <p className="text-sm font-medium">Fotos por subir:</p>
            <div className="grid grid-cols-4 gap-2">
              {pendingPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square bg-muted rounded-md overflow-hidden group"
                >
                  <img
                    src={photo.preview}
                    alt="Preview"
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setSelectedPending(photo)}
                  />
                  {/* Remove button */}
                  <button
                    className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white hover:bg-black/80"
                    onClick={() => removePendingPhoto(photo.id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={openCamera}
                disabled={isUploading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Otra Foto
              </Button>
              <Button
                className="flex-1"
                onClick={uploadAllPhotos}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {uploadProgress}%
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir {pendingPhotos.length} foto{pendingPhotos.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Take first photo button (only when no pending) */}
        {!hasPendingPhotos && (
          <Button
            variant="outline"
            className="w-full h-24 border-dashed"
            onClick={openCamera}
            disabled={isUploading}
          >
            <Camera className="h-6 w-6 mr-2" />
            Tomar Foto
          </Button>
        )}

        {/* Error message */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Existing photos grid */}
        {existingPhotos.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Fotos guardadas: {existingPhotos.length}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {existingPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square bg-muted rounded-md overflow-hidden group"
                >
                  {photo.url ? (
                    <img
                      src={photo.url}
                      alt={`Foto ${photo.orden + 1}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setSelectedPhoto(photo)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}

                  {/* Overlay with actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-white hover:bg-white/20"
                      onClick={() => setSelectedPhoto(photo)}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-white hover:bg-white/20"
                      onClick={() => handleDeletePhoto(photo.id)}
                      disabled={deletingPhotoId === photo.id}
                    >
                      {deletingPhotoId === photo.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photo viewer dialog - existing photos */}
        <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {LEGACY_PHOTO_TYPE_LABELS[tipo]} - Foto {selectedPhoto ? selectedPhoto.orden + 1 : ''}
              </DialogTitle>
            </DialogHeader>
            {selectedPhoto?.url && (
              <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
                <img
                  src={selectedPhoto.url}
                  alt={`Foto ${selectedPhoto.orden + 1}`}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Photo viewer dialog - pending photos */}
        <Dialog open={!!selectedPending} onOpenChange={() => setSelectedPending(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Vista previa
              </DialogTitle>
            </DialogHeader>
            {selectedPending && (
              <div className="space-y-4">
                <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
                  <img
                    src={selectedPending.preview}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => removePendingPhoto(selectedPending.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSelectedPending(null)}
                  >
                    Cerrar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
