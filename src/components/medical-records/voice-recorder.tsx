'use client'

/**
 * Minimal Voice Recorder Component
 * Just records audio and provides transcribed text to parent
 */

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createAudioUploadUrl } from '@/lib/storage/receipts'

interface VoiceRecorderProps {
  /** Medical record ID for storing audio */
  medicalRecordId: string
  /** Callback when transcription is ready */
  onTranscription: (text: string) => void
  /** Callback when audio is saved */
  onAudioSaved?: (audio: { path: string; timestamp: string; transcription?: string }) => void
  /** Whether the component is disabled */
  disabled?: boolean
}

export function VoiceRecorder({
  medicalRecordId,
  onTranscription,
  onAudioSaved,
  disabled = false,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

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
        stream.getTracks().forEach(track => track.stop())
        const blobType = mediaRecorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(chunksRef.current, { type: blobType })
        await processAudio(audioBlob)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(1000)
      setIsRecording(true)

    } catch (error) {
      console.error('Error starting recording:', error)
      toast.error('No se pudo acceder al microfono')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true)
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
        onTranscription(result.text)
        toast.success('Transcripcion lista')
      }

    } catch (error) {
      console.error('Transcription error:', error)
      toast.error('Error al transcribir')
    }

    // Upload audio
    if (onAudioSaved) {
      try {
        const urlResult = await createAudioUploadUrl(medicalRecordId)
        if ('error' in urlResult) {
          throw new Error(urlResult.error)
        }

        const uploadResponse = await fetch(urlResult.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'audio/webm' },
          body: audioBlob,
        })

        if (uploadResponse.ok) {
          onAudioSaved({
            path: urlResult.path,
            timestamp: new Date().toISOString(),
            transcription: transcribedText,
          })
        }
      } catch (error) {
        console.error('Audio upload error:', error)
      }
    }

    setIsProcessing(false)
  }

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={isRecording ? 'destructive' : 'outline'}
        size="sm"
        onClick={toggleRecording}
        disabled={disabled || isProcessing}
        className="gap-2"
      >
        {isRecording ? (
          <>
            <MicOff className="h-4 w-4" />
            Detener
          </>
        ) : isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Procesando...
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            Grabar
          </>
        )}
      </Button>
      {isRecording && (
        <Badge variant="destructive" className="animate-pulse">
          Grabando...
        </Badge>
      )}
    </div>
  )
}
