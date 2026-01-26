'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Upload, Loader2 } from 'lucide-react'
import { createCierreUploadUrl } from '@/lib/storage/receipts'
import { createClient } from '@/lib/supabase/client'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

function validatePhotoFile(file: { size: number; type: string }): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return 'El archivo es muy grande. Maximo 5MB.'
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Tipo de archivo no permitido. Use JPEG, PNG, WebP o HEIC.'
  }
  return null
}

interface CierrePhotoUploadProps {
  fecha: string
  onUploadComplete: (path: string) => void
  onRemove: () => void
  initialPath?: string | null
  disabled?: boolean
  required?: boolean
  error?: string
}

export function CierrePhotoUpload({
  fecha,
  onUploadComplete,
  onRemove,
  initialPath,
  disabled,
  required,
  error
}: CierrePhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploadedPath, setUploadedPath] = useState<string | null>(initialPath || null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)

    // Client-side validation
    const validationError = validatePhotoFile({ size: file.size, type: file.type })
    if (validationError) {
      setUploadError(validationError)
      return
    }

    // Create preview
    const previewUrl = URL.createObjectURL(file)
    setPreview(previewUrl)
    setFileName(file.name)

    // Upload to Supabase Storage
    setIsUploading(true)
    try {
      // Get signed URL from server (using cierre-specific function)
      const urlResult = await createCierreUploadUrl(file.name, fecha)
      if ('error' in urlResult) {
        throw new Error(urlResult.error)
      }

      // Upload directly to storage
      const supabase = createClient()
      const { error: uploadErr } = await supabase.storage
        .from('payment-receipts')
        .uploadToSignedUrl(urlResult.path, urlResult.signedUrl.split('?')[1], file)

      if (uploadErr) {
        throw uploadErr
      }

      setUploadedPath(urlResult.path)
      onUploadComplete(urlResult.path)
    } catch (err) {
      console.error('Upload error:', err)
      setUploadError('Error al subir la imagen. Intente de nuevo.')
      // Clear preview on error
      URL.revokeObjectURL(previewUrl)
      setPreview(null)
      setFileName(null)
    } finally {
      setIsUploading(false)
    }
  }, [fecha, onUploadComplete])

  const handleRemove = useCallback(() => {
    if (preview) {
      URL.revokeObjectURL(preview)
    }
    setPreview(null)
    setFileName(null)
    setUploadedPath(null)
    setUploadError(null)
    onRemove()
  }, [preview, onRemove])

  const displayError = uploadError || error

  return (
    <div className="space-y-2">
      <Label className={required ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ''}>
        Foto del reporte firmado
      </Label>

      {!preview && !uploadedPath ? (
        <div className={`border-2 border-dashed rounded-lg p-6 text-center ${displayError ? 'border-red-500' : 'border-muted'}`}>
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleFileChange}
            disabled={disabled || isUploading}
            className="hidden"
            id="cierre-photo-upload"
          />
          <label
            htmlFor="cierre-photo-upload"
            className={`cursor-pointer flex flex-col items-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                <span className="text-sm text-muted-foreground">Subiendo...</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Subir foto del reporte firmado
                </span>
                <span className="text-xs text-muted-foreground">
                  JPEG, PNG, WebP o HEIC (max 5MB)
                </span>
              </>
            )}
          </label>
        </div>
      ) : (
        <div className="relative inline-block">
          {preview ? (
            <Image
              src={preview}
              alt="Vista previa del reporte"
              width={200}
              height={200}
              className="rounded-lg object-cover border"
            />
          ) : uploadedPath ? (
            <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center border">
              <span className="text-sm text-muted-foreground text-center px-2">
                Foto guardada
              </span>
            </div>
          ) : null}

          {!disabled && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6"
              onClick={handleRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {fileName && (
            <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]">
              {fileName}
            </p>
          )}
        </div>
      )}

      {displayError && (
        <p className="text-sm text-red-500">{displayError}</p>
      )}
    </div>
  )
}
