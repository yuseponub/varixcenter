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
import { Camera, Trash2, ZoomIn, Loader2, Plus, Upload, X, RotateCw } from 'lucide-react'
import { createLegacyPhotoUploadUrl, getLegacyPhotoSignedUrl } from '@/lib/storage/receipts'
import { createLegacyPhoto, deleteLegacyPhoto } from '@/lib/queries/legacy-photos'
import type { LegacyPhotoType, LegacyHistoryPhotoWithUrl } from '@/types'
import { LEGACY_PHOTO_TYPE_LABELS } from '@/types'

interface PendingPhoto {
  id: string
  file: File
  preview: string
  rotation: number
}

interface LegacyPhotoCaptureProps {
  medicalRecordId: string
  tipo: LegacyPhotoType
  existingPhotos: LegacyHistoryPhotoWithUrl[]
  onPhotoAdded?: () => void
  onPhotoDeleted?: () => void
}

// Rotate image using canvas
async function rotateImage(file: File, degrees: number): Promise<{ file: File; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      // Swap dimensions for 90/270 degree rotations
      if (degrees === 90 || degrees === 270) {
        canvas.width = img.height
        canvas.height = img.width
      } else {
        canvas.width = img.width
        canvas.height = img.height
      }

      // Move to center and rotate
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((degrees * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Could not create blob'))
            return
          }
          const rotatedFile = new File([blob], file.name, { type: 'image/jpeg' })
          const preview = URL.createObjectURL(rotatedFile)
          resolve({ file: rotatedFile, preview })
        },
        'image/jpeg',
        0.9
      )
    }
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = URL.createObjectURL(file)
  })
}

// Rotate image from URL (for already uploaded photos)
async function rotateImageFromUrl(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      // Rotate 90 degrees clockwise - swap dimensions
      canvas.width = img.height
      canvas.height = img.width

      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((90 * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Could not create blob'))
            return
          }
          resolve(blob)
        },
        'image/jpeg',
        0.9
      )
    }
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })
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
  const [rotatingPhotoId, setRotatingPhotoId] = useState<string | null>(null)
  const [rotatingExistingId, setRotatingExistingId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file selection (from native camera)
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Create preview URL
    const preview = URL.createObjectURL(file)
    const id = `pending-${Date.now()}`

    setPendingPhotos(prev => [...prev, { id, file, preview, rotation: 0 }])
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

  // Rotate pending photo
  const rotatePendingPhoto = useCallback(async (id: string) => {
    const photo = pendingPhotos.find(p => p.id === id)
    if (!photo) return

    setRotatingPhotoId(id)
    try {
      const newRotation = (photo.rotation + 90) % 360
      const { file: rotatedFile, preview: newPreview } = await rotateImage(photo.file, 90)

      // Revoke old preview URL
      URL.revokeObjectURL(photo.preview)

      setPendingPhotos(prev =>
        prev.map(p =>
          p.id === id
            ? { ...p, file: rotatedFile, preview: newPreview, rotation: newRotation }
            : p
        )
      )

      // Update selected if it's the same photo
      if (selectedPending?.id === id) {
        setSelectedPending(prev => prev ? { ...prev, file: rotatedFile, preview: newPreview, rotation: newRotation } : null)
      }
    } catch (err) {
      console.error('Error rotating photo:', err)
      setError('Error al rotar la foto')
    } finally {
      setRotatingPhotoId(null)
    }
  }, [pendingPhotos, selectedPending])

  // Rotate existing (uploaded) photo
  const rotateExistingPhoto = useCallback(async (photo: LegacyHistoryPhotoWithUrl) => {
    if (!photo.url) return

    setRotatingExistingId(photo.id)
    setError(null)

    try {
      // Get rotated image blob
      const rotatedBlob = await rotateImageFromUrl(photo.url)

      // Get new upload URL
      const uploadResult = await createLegacyPhotoUploadUrl(medicalRecordId, tipo)
      if ('error' in uploadResult) {
        throw new Error(uploadResult.error)
      }

      // Upload rotated image
      const uploadResponse = await fetch(uploadResult.signedUrl, {
        method: 'PUT',
        body: rotatedBlob,
        headers: { 'Content-Type': 'image/jpeg' },
      })

      if (!uploadResponse.ok) {
        throw new Error('Error al subir la imagen rotada')
      }

      // Create new database record
      const newPhoto = await createLegacyPhoto({
        medical_record_id: medicalRecordId,
        tipo,
        storage_path: uploadResult.path,
        orden: photo.orden,
      })

      if (!newPhoto) {
        throw new Error('Error al guardar la foto rotada')
      }

      // Delete old photo
      await deleteLegacyPhoto(photo.id)

      // Close dialog and refresh
      setSelectedPhoto(null)
      onPhotoAdded?.()
    } catch (err) {
      console.error('Error rotating existing photo:', err)
      setError(err instanceof Error ? err.message : 'Error al rotar la foto')
    } finally {
      setRotatingExistingId(null)
    }
  }, [medicalRecordId, tipo, onPhotoAdded])

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
        setSelectedPhoto(null)
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
            <div className="grid grid-cols-3 gap-2">
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
                  {/* Rotate button */}
                  <button
                    className="absolute top-1 left-1 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80"
                    onClick={(e) => {
                      e.stopPropagation()
                      rotatePendingPhoto(photo.id)
                    }}
                    disabled={rotatingPhotoId === photo.id}
                  >
                    {rotatingPhotoId === photo.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCw className="h-3 w-3" />
                    )}
                  </button>
                  {/* Remove button */}
                  <button
                    className="absolute top-1 right-1 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80"
                    onClick={(e) => {
                      e.stopPropagation()
                      removePendingPhoto(photo.id)
                    }}
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
                    Subir {pendingPhotos.length}
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
            <div className="grid grid-cols-3 gap-2">
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
                      className="h-8 w-8 text-white hover:bg-white/20"
                      onClick={() => setSelectedPhoto(photo)}
                    >
                      <ZoomIn className="h-4 w-4" />
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
              <div className="space-y-4">
                <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
                  <img
                    src={selectedPhoto.url}
                    alt={`Foto ${selectedPhoto.orden + 1}`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => rotateExistingPhoto(selectedPhoto)}
                    disabled={rotatingExistingId === selectedPhoto.id}
                  >
                    {rotatingExistingId === selectedPhoto.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RotateCw className="h-4 w-4 mr-2" />
                    )}
                    Rotar
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleDeletePhoto(selectedPhoto.id)}
                    disabled={deletingPhotoId === selectedPhoto.id}
                  >
                    {deletingPhotoId === selectedPhoto.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Eliminar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Photo viewer dialog - pending photos */}
        <Dialog open={!!selectedPending} onOpenChange={() => setSelectedPending(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Vista previa</DialogTitle>
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
                    variant="outline"
                    className="flex-1"
                    onClick={() => rotatePendingPhoto(selectedPending.id)}
                    disabled={rotatingPhotoId === selectedPending.id}
                  >
                    {rotatingPhotoId === selectedPending.id ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RotateCw className="h-4 w-4 mr-2" />
                    )}
                    Rotar
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => removePendingPhoto(selectedPending.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
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
