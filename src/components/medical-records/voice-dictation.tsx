'use client'

/**
 * Voice Dictation Component
 *
 * Uses OpenAI Whisper API for accurate Spanish medical transcription.
 * Records audio, sends to API for transcription, and stores audio for backup.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Mic, MicOff, Trash2, Copy, Check, Loader2, Play, Pause, Volume2 } from 'lucide-react'
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
          {isUploading && (
            <Badge variant="outline">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Guardando audio...
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Presione el microfono para dictar. El audio se guarda como respaldo.
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
            disabled={disabled || isTranscribing || isUploading}
            className="gap-2"
          >
            {isRecording ? (
              <>
                <MicOff className="h-5 w-5" />
                Detener
              </>
            ) : isTranscribing || isUploading ? (
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

        {/* Saved Audios */}
        {savedAudios.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <Volume2 className="h-4 w-4" />
              Audios guardados ({savedAudios.length})
            </p>
            <div className="space-y-2">
              {savedAudios.map((audio, index) => (
                <div
                  key={audio.path}
                  className="flex items-center gap-2 p-2 bg-muted rounded text-sm"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => togglePlayAudio(audio.path)}
                  >
                    {playingAudio === audio.path ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <span className="text-muted-foreground">
                    Audio {index + 1} - {formatTimestamp(audio.timestamp)}
                  </span>
                  {audio.transcription && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={audio.transcription}>
                      &quot;{audio.transcription.substring(0, 50)}...&quot;
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-medium">Instrucciones:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>Presione &quot;Dictar&quot; y hable claramente</li>
            <li>Presione &quot;Detener&quot; cuando termine</li>
            <li>El texto se transcribira automaticamente</li>
            <li>El audio se guarda como respaldo medico</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
