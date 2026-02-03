'use client'

/**
 * Voice Dictation Component
 *
 * Uses OpenAI Whisper API for accurate Spanish medical transcription.
 * Records audio, sends to API for transcription, and stores audio for backup.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Mic, MicOff, Trash2, Copy, Check, Loader2, Play, Pause, Volume2, FileText, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createAudioUploadUrl, getAudioSignedUrl } from '@/lib/storage/receipts'

interface AudioRecording {
  path: string
  timestamp: string
  transcription?: string
}

interface VoiceDictationProps {
  /** Current diagnosis text */
  value: string | null
  /** Callback when text changes */
  onChange: (value: string) => void
  /** Medical record ID for storing audio */
  medicalRecordId?: string
  /** Saved audio recordings */
  savedAudios?: AudioRecording[]
  /** Callback when new audio is saved */
  onAudioSaved?: (audio: AudioRecording) => void
  /** Callback to add text as progress note */
  onAddAsProgressNote?: (text: string) => void
  /** Whether the component is disabled */
  disabled?: boolean
}

/**
 * Voice dictation component using OpenAI Whisper
 */
export function VoiceDictation({
  value,
  onChange,
  medicalRecordId,
  savedAudios = [],
  onAudioSaved,
  onAddAsProgressNote,
  disabled = false,
}: VoiceDictationProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Load signed URLs for saved audios
  useEffect(() => {
    async function loadAudioUrls() {
      const urls: Record<string, string> = {}
      for (const audio of savedAudios) {
        if (!audioUrls[audio.path]) {
          const url = await getAudioSignedUrl(audio.path)
          if (url) {
            urls[audio.path] = url
          }
        }
      }
      if (Object.keys(urls).length > 0) {
        setAudioUrls(prev => ({ ...prev, ...urls }))
      }
    }
    if (savedAudios.length > 0) {
      loadAudioUrls()
    }
  }, [savedAudios])

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Use supported mimeType: Safari/iOS only supports mp4, Chrome supports webm
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())

        // Create blob from chunks using the recorder's actual mimeType
        const blobType = mediaRecorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(chunksRef.current, { type: blobType })

        // Transcribe and optionally upload
        await processAudio(audioBlob)
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

  // Process audio: transcribe and upload
  const processAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true)
    let transcribedText = ''

    try {
      // Transcribe
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
        transcribedText = result.text
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

    // Upload audio if medicalRecordId is provided
    if (medicalRecordId && onAudioSaved) {
      setIsUploading(true)
      try {
        const urlResult = await createAudioUploadUrl(medicalRecordId)
        if ('error' in urlResult) {
          throw new Error(urlResult.error)
        }

        const uploadResponse = await fetch(urlResult.signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'audio/webm',
          },
          body: audioBlob,
        })

        if (!uploadResponse.ok) {
          throw new Error('Upload failed')
        }

        // Notify parent of saved audio
        onAudioSaved({
          path: urlResult.path,
          timestamp: new Date().toISOString(),
          transcription: transcribedText,
        })

        toast.success('Audio guardado')
      } catch (error) {
        console.error('Audio upload error:', error)
        toast.error('Error al guardar audio')
      } finally {
        setIsUploading(false)
      }
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

  // Play/pause audio
  const togglePlayAudio = async (path: string) => {
    if (playingAudio === path) {
      // Pause
      audioRef.current?.pause()
      setPlayingAudio(null)
    } else {
      // Play
      let url = audioUrls[path]
      if (!url) {
        url = await getAudioSignedUrl(path) || ''
        if (url) {
          setAudioUrls(prev => ({ ...prev, [path]: url }))
        }
      }

      if (url) {
        if (audioRef.current) {
          audioRef.current.pause()
        }
        const audio = new Audio(url)
        audio.onended = () => setPlayingAudio(null)
        audioRef.current = audio
        audio.play()
        setPlayingAudio(path)
      }
    }
  }

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Add text to progress notes
  const handleAddToProgressNotes = () => {
    if (value && onAddAsProgressNote) {
      onAddAsProgressNote(value)
      onChange('')
      toast.success('Agregado a Notas de Evolucion')
    }
  }

  return (
    <Card className={cn(disabled && 'opacity-50 pointer-events-none')}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Dictado de Voz
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
          {isUploading && (
            <Badge variant="outline">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Guardando...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={isRecording ? 'destructive' : 'default'}
            onClick={toggleRecording}
            disabled={disabled || isTranscribing || isUploading}
            className="gap-2"
          >
            {isRecording ? (
              <>
                <MicOff className="h-4 w-4" />
                Detener
              </>
            ) : isTranscribing || isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
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
            title="Limpiar"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleCopy}
            disabled={disabled || !value}
            title="Copiar"
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
          placeholder="Dicte o escriba aqui..."
          className="min-h-[120px] resize-y"
          disabled={disabled || isRecording || isTranscribing}
        />

        {/* Action buttons - where to add the text */}
        {value && value.trim().length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground self-center">Guardar en:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={disabled}
              title="El texto ya se guarda automaticamente en Diagnostico"
            >
              <FileText className="h-3 w-3" />
              Diagnostico
              <Check className="h-3 w-3 text-green-500" />
            </Button>
            {onAddAsProgressNote && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddToProgressNotes}
                disabled={disabled}
                className="gap-1"
              >
                <ScrollText className="h-3 w-3" />
                Nota de Evolucion
              </Button>
            )}
          </div>
        )}

        {/* Saved Audios - compact */}
        {savedAudios.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium mb-2 flex items-center gap-1 text-muted-foreground">
              <Volume2 className="h-3 w-3" />
              Audios ({savedAudios.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {savedAudios.map((audio, index) => (
                <Button
                  key={audio.path}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => togglePlayAudio(audio.path)}
                >
                  {playingAudio === audio.path ? (
                    <Pause className="h-3 w-3 mr-1" />
                  ) : (
                    <Play className="h-3 w-3 mr-1" />
                  )}
                  {formatTimestamp(audio.timestamp)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
