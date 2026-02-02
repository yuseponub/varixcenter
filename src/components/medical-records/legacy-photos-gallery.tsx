'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Camera, ZoomIn, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import type { LegacyPhotoType, LegacyHistoryPhotoWithUrl } from '@/types'
import { LEGACY_PHOTO_TYPE_LABELS } from '@/types'
import { rotateLegacyPhoto } from '@/app/(protected)/historias/actions'

interface LegacyPhotosGalleryProps {
  tipo: LegacyPhotoType
  photos: LegacyHistoryPhotoWithUrl[]
  onAddMore?: () => void
}

export function LegacyPhotosGallery({
  tipo,
  photos: initialPhotos,
  onAddMore,
}: LegacyPhotosGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [photos, setPhotos] = useState(initialPhotos)
  const [isPending, startTransition] = useTransition()

  const openViewer = (index: number) => {
    setSelectedIndex(index)
  }

  const closeViewer = () => {
    setSelectedIndex(null)
  }

  const goToPrevious = () => {
    if (selectedIndex === null) return
    setSelectedIndex(selectedIndex === 0 ? photos.length - 1 : selectedIndex - 1)
  }

  const goToNext = () => {
    if (selectedIndex === null) return
    setSelectedIndex(selectedIndex === photos.length - 1 ? 0 : selectedIndex + 1)
  }

  const handleRotate = (photoId: string, currentIndex: number) => {
    // Optimistic update
    setPhotos(prev => prev.map((p, i) =>
      i === currentIndex
        ? { ...p, rotation: ((p.rotation || 0) + 90) % 360 }
        : p
    ))

    startTransition(async () => {
      const result = await rotateLegacyPhoto(photoId)
      if ('error' in result) {
        // Revert on error
        setPhotos(prev => prev.map((p, i) =>
          i === currentIndex
            ? { ...p, rotation: ((p.rotation || 0) - 90 + 360) % 360 }
            : p
        ))
      }
    })
  }

  const selectedPhoto = selectedIndex !== null ? photos[selectedIndex] : null

  const getRotationStyle = (rotation: number | undefined) => ({
    transform: `rotate(${rotation || 0}deg)`,
  })

  if (photos.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {LEGACY_PHOTO_TYPE_LABELS[tipo]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay fotos de {LEGACY_PHOTO_TYPE_LABELS[tipo].toLowerCase()}</p>
            {onAddMore && (
              <Button variant="link" className="mt-2" onClick={onAddMore}>
                Tomar fotos
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4" />
              {LEGACY_PHOTO_TYPE_LABELS[tipo]}
              <span className="text-muted-foreground font-normal">
                ({photos.length} foto{photos.length !== 1 ? 's' : ''})
              </span>
            </CardTitle>
            {onAddMore && (
              <Button variant="outline" size="sm" onClick={onAddMore}>
                <Camera className="h-4 w-4 mr-2" />
                Anadir
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="relative aspect-square bg-muted rounded-md overflow-hidden cursor-pointer group"
                onClick={() => openViewer(index)}
              >
                {photo.url ? (
                  <img
                    src={photo.url}
                    alt={`${LEGACY_PHOTO_TYPE_LABELS[tipo]} foto ${index + 1}`}
                    className="w-full h-full object-cover transition-transform"
                    style={getRotationStyle(photo.rotation)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Full-screen viewer */}
      <Dialog open={selectedIndex !== null} onOpenChange={closeViewer}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                {LEGACY_PHOTO_TYPE_LABELS[tipo]} - Foto {selectedIndex !== null ? selectedIndex + 1 : ''} de {photos.length}
              </DialogTitle>
              {selectedPhoto && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRotate(selectedPhoto.id, selectedIndex!)
                  }}
                  disabled={isPending}
                >
                  <RotateCw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
                  Rotar
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="relative flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center">
            {selectedPhoto?.url && (
              <img
                src={selectedPhoto.url}
                alt={`${LEGACY_PHOTO_TYPE_LABELS[tipo]} foto ${selectedIndex !== null ? selectedIndex + 1 : ''}`}
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                style={getRotationStyle(selectedPhoto.rotation)}
              />
            )}

            {/* Navigation arrows */}
            {photos.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/50 hover:bg-black/70 text-white"
                  onClick={(e) => {
                    e.stopPropagation()
                    goToPrevious()
                  }}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/50 hover:bg-black/70 text-white"
                  onClick={(e) => {
                    e.stopPropagation()
                    goToNext()
                  }}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}
          </div>

          {/* Thumbnail strip */}
          {photos.length > 1 && (
            <div className="flex gap-1 overflow-x-auto py-2">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 ${
                    index === selectedIndex
                      ? 'border-primary'
                      : 'border-transparent'
                  }`}
                  onClick={() => setSelectedIndex(index)}
                >
                  {photo.url ? (
                    <img
                      src={photo.url}
                      alt={`Miniatura ${index + 1}`}
                      className="w-full h-full object-cover transition-transform"
                      style={getRotationStyle(photo.rotation)}
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Camera className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
