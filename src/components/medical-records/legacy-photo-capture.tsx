'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Camera, X, Check, RotateCcw, Trash2, ZoomIn, Loader2 } from 'lucide-react'
import { createLegacyPhotoUploadUrl } from '@/lib/storage/receipts'
import { createLegacyPhoto, deleteLegacyPhoto } from '@/lib/queries/legacy-photos'
import type { LegacyPhotoType, LegacyHistoryPhotoWithUrl } from '@/types'
import { LEGACY_PHOTO_TYPE_LABELS } from '@/types'

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
  const [isCapturing, setIsCapturing] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<LegacyHistoryPhotoWithUrl | null>(null)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Start camera
  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Camara trasera
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setIsCapturing(true)
    } catch (err) {
      console.error('Error accessing camera:', err)
      setError('No se pudo acceder a la camara. Verifica los permisos.')
    }
  }, [])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCapturing(false)
    setCapturedImage(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Capture photo from video
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)

    const imageData = canvas.toDataURL('image/jpeg', 0.85)
    setCapturedImage(imageData)
  }, [])

  // Retry capture
  const retryCapture = useCallback(() => {
    setCapturedImage(null)
  }, [])

  // Confirm and upload photo
  const confirmPhoto = useCallback(async () => {
    if (!capturedImage) return

    setIsUploading(true)
    setError(null)

    try {
      // Get upload URL
      const uploadResult = await createLegacyPhotoUploadUrl(medicalRecordId, tipo)

      if ('error' in uploadResult) {
        setError(uploadResult.error)
        setIsUploading(false)
        return
      }

      // Convert base64 to blob
      const response = await fetch(capturedImage)
      const blob = await response.blob()

      // Upload to storage
      const uploadResponse = await fetch(uploadResult.signedUrl, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': 'image/jpeg',
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

      // Success - stop camera and notify
      stopCamera()
      onPhotoAdded?.()
    } catch (err) {
      console.error('Error uploading photo:', err)
      setError('Error al subir la foto. Intenta de nuevo.')
    } finally {
      setIsUploading(false)
    }
  }, [capturedImage, medicalRecordId, tipo, stopCamera, onPhotoAdded])

  // Delete photo
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4" />
          {LEGACY_PHOTO_TYPE_LABELS[tipo]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Camera view or capture button */}
        {isCapturing ? (
          <div className="space-y-3">
            {/* Video or captured image preview */}
            <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden">
              {capturedImage ? (
                <img
                  src={capturedImage}
                  alt="Foto capturada"
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            {/* Canvas for capturing (hidden) */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Action buttons */}
            <div className="flex justify-center gap-2">
              {capturedImage ? (
                <>
                  <Button
                    variant="outline"
                    onClick={retryCapture}
                    disabled={isUploading}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Repetir
                  </Button>
                  <Button
                    onClick={confirmPhoto}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Confirmar
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={stopCamera}>
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                  <Button onClick={capturePhoto}>
                    <Camera className="h-4 w-4 mr-2" />
                    Capturar
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full h-24 border-dashed"
            onClick={startCamera}
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
              Fotos tomadas: {existingPhotos.length}
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

        {/* Photo viewer dialog */}
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
      </CardContent>
    </Card>
  )
}
