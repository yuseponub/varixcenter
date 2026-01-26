'use client'

/**
 * Voice Dictation Component
 *
 * Uses OpenAI Whisper API for accurate Spanish medical transcription.
 * Records audio and sends to API for transcription.
 */

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Mic, MicOff, Trash2, Copy, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface VoiceDictationProps {
  /** Current diagnosis text */
  value: string | null
  /** Callback when text changes */
  onChange: (value: string) => void
  /** Whether the component is disabled */
  disabled?: boolean
}

/**
 * Voice dictation component using OpenAI Whisper
 */
export function VoiceDictation({
  value,
  onChange,
  disabled = false,
}: VoiceDictationProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [copied, setCopied] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())

        // Create blob from chunks
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })

        // Transcribe
        await transcribeAudio(audioBlob)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(1000) // Collect data every second
      setIsRecording(true)

    } catch (error) {
      console.error('Error starting recording:', error)
      toast.error('No se pudo acceder al microfono. Verifique los permisos.')
    }
  }, [])

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  // Transcribe audio using Whisper API
  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true)

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Transcription failed')
      }

      const result = await response.json()

      if (result.text) {
        // Append to existing text
        const currentValue = value || ''
        const newValue = currentValue + (currentValue ? ' ' : '') + result.text
        onChange(newValue)
        toast.success('Transcripcion completada')
      }

    } catch (error) {
      console.error('Transcription error:', error)
      toast.error('Error al transcribir. Intente de nuevo.')
    } finally {
      setIsTranscribing(false)
    }
  }

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // Clear text
  const handleClear = () => {
    onChange('')
  }

  // Copy to clipboard
  const handleCopy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Texto copiado al portapapeles')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Error al copiar')
    }
  }

  // Handle manual text input
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  return (
    <Card className={cn(disabled && 'opacity-50 pointer-events-none')}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Diagnostico por Voz
          {isRecording && (
            <Badge variant="destructive" className="animate-pulse">
              Grabando...
            </Badge>
          )}
          {isTranscribing && (
            <Badge variant="secondary">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Transcribiendo...
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Presione el microfono para dictar. Usa OpenAI Whisper para maxima precision.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={isRecording ? 'destructive' : 'default'}
            size="lg"
            onClick={toggleRecording}
            disabled={disabled || isTranscribing}
            className="gap-2"
          >
            {isRecording ? (
              <>
                <MicOff className="h-5 w-5" />
                Detener
              </>
            ) : isTranscribing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Mic className="h-5 w-5" />
                Dictar
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleClear}
            disabled={disabled || !value || isRecording || isTranscribing}
            title="Limpiar texto"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleCopy}
            disabled={disabled || !value}
            title="Copiar texto"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Text area */}
        <Textarea
          value={value || ''}
          onChange={handleTextChange}
          placeholder="El diagnostico aparecera aqui al dictar, o puede escribir manualmente..."
          className="min-h-[200px] resize-y"
          disabled={disabled || isRecording || isTranscribing}
        />

        {/* Word count */}
        <div className="text-xs text-muted-foreground text-right">
          {value ? value.split(/\s+/).filter(Boolean).length : 0} palabras
        </div>

        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-medium">Instrucciones:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>Presione &quot;Dictar&quot; y hable claramente</li>
            <li>Presione &quot;Detener&quot; cuando termine</li>
            <li>El texto se transcribira automaticamente</li>
            <li>Puede editar el texto manualmente despues</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
