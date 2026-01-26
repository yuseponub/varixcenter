'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { createInvoiceUploadUrl } from '@/lib/storage/receipts'
import type { OCRInvoiceResult } from '@/types/medias/purchases'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'processing' } // OCR in progress
  | { status: 'success'; path: string; ocrResult?: OCRInvoiceResult }
  | { status: 'error'; message: string }

interface InvoiceUploadProps {
  onUploadComplete: (path: string, ocrResult?: OCRInvoiceResult) => void
  onError?: (message: string) => void
  initialPath?: string
}

export function InvoiceUpload({
  onUploadComplete,
  onError,
  initialPath,
}: InvoiceUploadProps) {
  const [state, setState] = useState<UploadState>(
    initialPath ? { status: 'success', path: initialPath } : { status: 'idle' }
  )
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      const message = 'Tipo de archivo no permitido. Use JPG, PNG, WebP o PDF.'
      setState({ status: 'error', message })
      onError?.(message)
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const message = 'Archivo muy grande. Maximo 10MB.'
      setState({ status: 'error', message })
      onError?.(message)
      return
    }

    setFileName(file.name)

    // Create preview for images (not PDFs)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setPreview(null) // PDF - no preview
    }

    // Upload to storage
    setState({ status: 'uploading', progress: 0 })

    try {
      // Get signed upload URL
      const result = await createInvoiceUploadUrl(file.name)
      if ('error' in result) {
        throw new Error(result.error)
      }

      setState({ status: 'uploading', progress: 30 })

      // Upload file
      const uploadResponse = await fetch(result.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error('Error al subir archivo')
      }

      setState({ status: 'uploading', progress: 60 })

      // Process with OCR
      setState({ status: 'processing' })

      const formData = new FormData()
      formData.append('file', file)

      const ocrResponse = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      })

      let ocrResult: OCRInvoiceResult | undefined

      if (ocrResponse.ok) {
        ocrResult = await ocrResponse.json()
      } else {
        console.warn('OCR failed, continuing without parsed data')
        // Don't fail the upload if OCR fails
      }

      setState({ status: 'success', path: result.path, ocrResult })
      onUploadComplete(result.path, ocrResult)

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al subir archivo'
      setState({ status: 'error', message })
      onError?.(message)
    }
  }

  const handleRemove = () => {
    setState({ status: 'idle' })
    setPreview(null)
    setFileName(null)
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const isPDF = fileName?.toLowerCase().endsWith('.pdf')

  return (
    <Card>
      <CardContent className="p-4">
        <Label className="mb-2 block font-medium">
          Foto/PDF de Factura <span className="text-red-500">*</span>
        </Label>

        {state.status === 'idle' && (
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              Haga clic para seleccionar archivo
            </p>
            <p className="text-xs text-gray-500 mt-1">
              JPG, PNG, WebP o PDF (max 10MB)
            </p>
          </div>
        )}

        {state.status === 'uploading' && (
          <div className="border rounded-lg p-8 text-center">
            <Loader2 className="mx-auto h-12 w-12 text-blue-500 animate-spin" />
            <p className="mt-2 text-sm text-gray-600">
              Subiendo... {state.progress}%
            </p>
          </div>
        )}

        {state.status === 'processing' && (
          <div className="border rounded-lg p-8 text-center">
            <Loader2 className="mx-auto h-12 w-12 text-green-500 animate-spin" />
            <p className="mt-2 text-sm text-gray-600">
              Procesando factura con OCR...
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Esto puede tardar unos segundos
            </p>
          </div>
        )}

        {state.status === 'success' && (
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isPDF ? (
                  <FileText className="h-10 w-10 text-red-500" />
                ) : preview ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="h-16 w-16 object-cover rounded"
                  />
                ) : (
                  <ImageIcon className="h-10 w-10 text-blue-500" />
                )}
                <div>
                  <p className="font-medium text-sm truncate max-w-[200px]">
                    {fileName || 'Archivo subido'}
                  </p>
                  <p className="text-xs text-green-600">
                    {state.ocrResult
                      ? `${state.ocrResult.productos?.length || 0} productos detectados`
                      : 'Subido correctamente'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemove}
                type="button"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="border border-red-300 bg-red-50 rounded-lg p-4">
            <p className="text-red-600 text-sm">{state.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleRemove}
              type="button"
            >
              Intentar de nuevo
            </Button>
          </div>
        )}

        <Input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
      </CardContent>
    </Card>
  )
}
