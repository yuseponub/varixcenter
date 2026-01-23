# Módulo: Historias Clínicas

## Descripción General

El módulo de Historias Clínicas gestiona todo el registro médico de los pacientes, desde los datos de ingreso hasta el diagnóstico y plan de tratamiento. Incluye la funcionalidad de dictado por voz para que el médico pueda registrar diagnósticos de forma eficiente.

---

## Funcionalidades

### 1. Crear Historia Clínica (Valoración)

**Flujo completo:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE VALORACIÓN                              │
└─────────────────────────────────────────────────────────────────────┘

  RECEPCIÓN                 ENFERMERA                 MÉDICO
      │                         │                        │
      │  Paciente llega         │                        │
      │  y paga valoración      │                        │
      │  ($100.000)             │                        │
      │                         │                        │
      ▼                         │                        │
  ┌─────────┐                   │                        │
  │ Buscar/ │                   │                        │
  │ Crear   │                   │                        │
  │ Paciente│                   │                        │
  └────┬────┘                   │                        │
       │                        │                        │
       │  Pasa a consultorio    │                        │
       │───────────────────────>│                        │
       │                        │                        │
       │                        ▼                        │
       │                  ┌───────────┐                  │
       │                  │  Llenar   │                  │
       │                  │  datos    │                  │
       │                  │  iniciales│                  │
       │                  └─────┬─────┘                  │
       │                        │                        │
       │                        │  Avisa al médico       │
       │                        │───────────────────────>│
       │                        │                        │
       │                        │                        ▼
       │                        │                  ┌───────────┐
       │                        │                  │  Examina  │
       │                        │                  │  paciente │
       │                        │                  │  + Doppler│
       │                        │                  └─────┬─────┘
       │                        │                        │
       │                        │                        ▼
       │                        │                  ┌───────────┐
       │                        │                  │  Dicta    │
       │                        │                  │diagnóstico│
       │                        │                  │  [🎤 VOZ] │
       │                        │                  └─────┬─────┘
       │                        │                        │
       │                        │  Sistema transcribe    │
       │                        │<───────────────────────│
       │                        │                        │
       │                        ▼                        │
       │                  ┌───────────┐                  │
       │                  │  Verifica │                  │
       │                  │  y ajusta │                  │
       │                  │cotización │                  │
       │                  └─────┬─────┘                  │
       │                        │                        │
       │                        │  Médico confirma       │
       │                        │───────────────────────>│
       │                        │                        │
       │                        ▼                        ▼
       │                  ┌───────────┐           ┌───────────┐
       │                  │  Imprime  │           │  Confirma │
       │                  │ cotización│           │           │
       │                  └───────────┘           └───────────┘
```

---

### 2. Formulario de Historia Clínica

**Secciones del formulario:**

#### Sección 1: Datos del Paciente (Auto-completados)
```
┌─────────────────────────────────────────────────────────────┐
│ DATOS DEL PACIENTE                            [Solo lectura]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Cédula: 37.840.063         Edad: 46 años                  │
│  Nombre: Mayarlandez Gutierrez Bayona                       │
│  Dirección: Diagonal 13 #60-125, Real de Minas             │
│  Ciudad: Bucaramanga        Celular: 321-310-4675          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Sección 2: Síntomas
```
┌─────────────────────────────────────────────────────────────┐
│ SÍNTOMAS                                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [✓] Dolor           [✓] Cansancio      [ ] Edema          │
│  [✓] Calambres       [✓] Prurito        [ ] Úlcera         │
│  [✓] Ardor           [ ] Adormecimiento [ ] Eczema         │
│  [ ] Lipodermatoesclerosis                                  │
│                                                             │
│  Tiempo de evolución: [    6 años          ]               │
│                                                             │
│  Dolor (escala 1-10): [●●●●●●○○○○] 6                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Sección 3: Inicio Relacionado
```
┌─────────────────────────────────────────────────────────────┐
│ INICIO RELACIONADO CON                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [ ] Adolescencia    [ ] Embarazo       [✓] Planificación  │
│  [✓] Trauma          [ ] Posquirúrgico                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Sección 4: Antecedentes
```
┌─────────────────────────────────────────────────────────────┐
│ ANTECEDENTES                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PATOLÓGICOS PERSONALES                                     │
│  [ ] Diabetes        [ ] Hipertensión   [ ] Hepatitis      │
│  [ ] Cardiopatía     [ ] Coagulopatía   [ ] TVP previa     │
│                                                             │
│  FAMILIARES (varices)                                       │
│  [ ] Padre           [ ] Madre          [ ] Hermanos       │
│                                                             │
│  GINECO-OBSTÉTRICOS                                         │
│  Embarazos (G): [ 2 ]   Partos: [ 2 ]   Cesáreas: [ 0 ]   │
│  ¿Planifica?: [Sí ▼]    Método: [_____________]            │
│                                                             │
│  QUIRÚRGICOS                                                │
│  [  CX Estéticas                                     ]      │
│                                                             │
│  ALERGIAS                                                   │
│  [  Ninguna conocida                                 ]      │
│                                                             │
│  MEDICAMENTOS ACTUALES                                      │
│  [  Ninguno                                          ]      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Sección 5: Hábitos
```
┌─────────────────────────────────────────────────────────────┐
│ HÁBITOS Y ESTILO DE VIDA                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Horas de pie/día:    [ 4 ]                                │
│  Horas sentada/día:   [ 6 ]                                │
│  Ejercicio:           [Ocasional ▼]                        │
│  Tabaquismo:          [No ▼]     Cigarrillos/día: [ - ]    │
│  Usa tacones:         [A veces ▼]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Sección 6: Diagnóstico (Con Dictado por Voz)
```
┌─────────────────────────────────────────────────────────────┐
│ DIAGNÓSTICO                                    [🎤 Dictar]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  Insuficiencia Venosa Crónica                       │   │
│  │                                                     │   │
│  │  Miembro Inferior Izquierdo:                        │   │
│  │  - Insuficiencia de vena safena externa            │   │
│  │  - Insuficiencia de vena perforante (x2)           │   │
│  │                                                     │   │
│  │  Miembro Inferior Derecho:                          │   │
│  │  - Insuficiencia de vena perforante peroneal       │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Clasificación CEAP: [C3 ▼]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. Sistema de Dictado por Voz

**Flujo del dictado:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE DICTADO POR VOZ                       │
└─────────────────────────────────────────────────────────────────────┘

  MÉDICO                    SISTEMA                      ENFERMERA
     │                         │                             │
     │  Click [🎤 Dictar]      │                             │
     │────────────────────────>│                             │
     │                         │                             │
     │                    ┌────┴────┐                        │
     │                    │ Activa  │                        │
     │                    │microfono│                        │
     │                    └────┬────┘                        │
     │                         │                             │
     │  "Paciente con          │                             │
     │   insuficiencia de      │                             │
     │   safena externa        │                             │
     │   izquierda con         │                             │
     │   reflujo, dos          │                             │
     │   perforantes           │                             │
     │   insuficientes..."     │                             │
     │────────────────────────>│                             │
     │                         │                             │
     │                    ┌────┴────┐                        │
     │                    │ Web     │                        │
     │                    │ Speech  │                        │
     │                    │ API     │                        │
     │                    │ (o      │                        │
     │                    │ Whisper)│                        │
     │                    └────┬────┘                        │
     │                         │                             │
     │                         │  Transcripción en          │
     │                         │  tiempo real               │
     │                         │                             │
     │  Muestra texto          │                             │
     │<────────────────────────│                             │
     │                         │                             │
     │                    ┌────┴────┐                        │
     │                    │ Procesa │                        │
     │                    │ con IA  │                        │
     │                    │(extrae  │                        │
     │                    │ datos)  │                        │
     │                    └────┬────┘                        │
     │                         │                             │
     │  Muestra datos          │  Muestra datos              │
     │  estructurados          │  estructurados              │
     │<────────────────────────│────────────────────────────>│
     │                         │                             │
     │  ┌─────────────────────────────────────────────────┐ │
     │  │ Diagnóstico detectado:                          │ │
     │  │                                                 │ │
     │  │ ✓ Safena externa izquierda - Reflujo           │ │
     │  │ ✓ Perforante 1 izquierda - Insuficiente        │ │
     │  │ ✓ Perforante 2 izquierda - Insuficiente        │ │
     │  │                                                 │ │
     │  │ Tratamiento sugerido:                           │ │
     │  │ • ECOR Safena Externa: $1.200.000              │ │
     │  │ • ECOR Perforante x2: $500.000                 │ │
     │  │ • Escleroterapia: ~15 sesiones                 │ │
     │  │                                                 │ │
     │  │ [Editar] [Confirmar]                           │ │
     │  └─────────────────────────────────────────────────┘ │
     │                         │                             │
     │  Click [Confirmar]      │                             │
     │────────────────────────>│                             │
     │                         │                             │
     │                         │  Genera cotización          │
     │                         │────────────────────────────>│
     │                         │                             │
     │                         │                   ┌─────────┴─────────┐
     │                         │                   │ Revisa, ajusta,   │
     │                         │                   │ imprime           │
     │                         │                   └───────────────────┘
```

**Implementación del dictado:**

```typescript
// components/features/voice/voice-recorder.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VoiceRecorderProps {
  onTranscription: (text: string) => void
  onProcessedData?: (data: DiagnosisData) => void
}

export function VoiceRecorder({ onTranscription, onProcessedData }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    // Verificar soporte de Web Speech API
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'es-CO'

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        setTranscript(prev => prev + finalTranscript)
        onTranscription(transcript + finalTranscript + interimTranscript)
      }

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setIsRecording(false)
      }
    }
  }, [])

  const startRecording = () => {
    if (recognitionRef.current) {
      setTranscript('')
      recognitionRef.current.start()
      setIsRecording(true)
    }
  }

  const stopRecording = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsRecording(false)

      // Procesar con IA para extraer datos estructurados
      if (onProcessedData && transcript) {
        setIsProcessing(true)
        try {
          const processed = await processDiagnosisWithAI(transcript)
          onProcessedData(processed)
        } finally {
          setIsProcessing(false)
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant={isRecording ? 'destructive' : 'default'}
          size="lg"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : isRecording ? (
            <MicOff className="h-5 w-5 mr-2" />
          ) : (
            <Mic className="h-5 w-5 mr-2" />
          )}
          {isProcessing ? 'Procesando...' : isRecording ? 'Detener' : 'Dictar'}
        </Button>

        {isRecording && (
          <div className="flex items-center gap-2 text-red-500">
            <span className="animate-pulse">●</span>
            <span>Grabando...</span>
          </div>
        )}
      </div>

      {transcript && (
        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-2">Transcripción:</p>
          <p>{transcript}</p>
        </div>
      )}
    </div>
  )
}
```

**Procesamiento con IA (extracción de datos):**

```typescript
// lib/ai/process-diagnosis.ts
export async function processDiagnosisWithAI(transcript: string): Promise<DiagnosisData> {
  // Usar el mismo patrón que el OCR de Varix Medias
  // Podemos usar la API de Claude o reglas básicas

  const response = await fetch('/api/process-diagnosis', {
    method: 'POST',
    body: JSON.stringify({ transcript }),
  })

  return response.json()
}

// Reglas básicas de extracción (sin IA externa)
export function extractDiagnosisLocally(transcript: string): DiagnosisData {
  const text = transcript.toLowerCase()

  const findings: Finding[] = []

  // Detectar safenas
  if (text.includes('safena externa') || text.includes('vse')) {
    const side = text.includes('izquierd') ? 'izquierda' :
                 text.includes('derech') ? 'derecha' : 'ambas'
    findings.push({
      type: 'safena_externa',
      side,
      treatment: 'ecor',
      price: 1200000,
    })
  }

  if (text.includes('safena interna') || text.includes('vsi') || text.includes('safena mayor')) {
    const side = text.includes('izquierd') ? 'izquierda' :
                 text.includes('derech') ? 'derecha' : 'ambas'
    findings.push({
      type: 'safena_interna',
      side,
      treatment: 'ecor',
      price: 1600000,
    })
  }

  // Detectar perforantes
  const perforanteMatch = text.match(/(\d+)\s*perforante/i)
  if (perforanteMatch || text.includes('perforante')) {
    const count = perforanteMatch ? parseInt(perforanteMatch[1]) : 1
    const side = text.includes('izquierd') ? 'izquierda' :
                 text.includes('derech') ? 'derecha' : 'ambas'

    for (let i = 0; i < count; i++) {
      findings.push({
        type: 'perforante',
        side,
        treatment: 'ecor',
        price: 250000,
      })
    }
  }

  // Calcular escleroterapia estimada
  const needsSclerotherapy = findings.length > 0
  const estimatedSessions = findings.length > 0 ? Math.max(10, findings.length * 5) : 0

  return {
    findings,
    estimatedSclerotherapySessions: estimatedSessions,
    totalEstimated: findings.reduce((sum, f) => sum + f.price, 0) + (estimatedSessions * 95000),
  }
}
```

---

### 4. Mapa Corporal Interactivo

**SVG interactivo para marcar zonas afectadas:**

```typescript
// components/features/medical/body-map.tsx
'use client'

import { useState } from 'react'

interface BodyMapProps {
  selectedZones: Zone[]
  onZoneSelect: (zone: Zone) => void
}

const BODY_ZONES = [
  { id: 'muslo_der', name: 'Muslo Derecho', path: 'M...' },
  { id: 'muslo_izq', name: 'Muslo Izquierdo', path: 'M...' },
  { id: 'rodilla_der', name: 'Rodilla Derecha', path: 'M...' },
  { id: 'rodilla_izq', name: 'Rodilla Izquierda', path: 'M...' },
  { id: 'pierna_der', name: 'Pierna Derecha', path: 'M...' },
  { id: 'pierna_izq', name: 'Pierna Izquierda', path: 'M...' },
  { id: 'tobillo_der', name: 'Tobillo Derecho', path: 'M...' },
  { id: 'tobillo_izq', name: 'Tobillo Izquierdo', path: 'M...' },
]

export function BodyMap({ selectedZones, onZoneSelect }: BodyMapProps) {
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)

  return (
    <div className="relative">
      <svg viewBox="0 0 200 400" className="w-full max-w-xs mx-auto">
        {/* Contorno del cuerpo */}
        <path
          d="M100,10 ... (silueta del cuerpo)"
          fill="none"
          stroke="#ccc"
          strokeWidth="2"
        />

        {/* Zonas interactivas */}
        {BODY_ZONES.map((zone) => {
          const isSelected = selectedZones.some(z => z.id === zone.id)
          const isHovered = hoveredZone === zone.id

          return (
            <path
              key={zone.id}
              d={zone.path}
              fill={isSelected ? '#ffe248' : isHovered ? '#e5e5e5' : 'transparent'}
              stroke={isSelected ? '#0e0142' : '#999'}
              strokeWidth={isSelected ? 2 : 1}
              className="cursor-pointer transition-colors"
              onClick={() => onZoneSelect(zone)}
              onMouseEnter={() => setHoveredZone(zone.id)}
              onMouseLeave={() => setHoveredZone(null)}
            />
          )
        })}

        {/* Números de referencia */}
        {selectedZones.map((zone, index) => (
          <text
            key={zone.id}
            x={zone.labelX}
            y={zone.labelY}
            className="text-xs font-bold fill-primary"
          >
            {index + 1}
          </text>
        ))}
      </svg>

      {/* Leyenda */}
      {selectedZones.length > 0 && (
        <div className="mt-4 space-y-2">
          {selectedZones.map((zone, index) => (
            <div key={zone.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                {index + 1}
              </span>
              <span>{zone.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onZoneSelect(zone)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

### 5. Generación de Cotización

**Flujo automático:**
1. Médico confirma diagnóstico
2. Sistema extrae procedimientos necesarios
3. Sistema calcula precios automáticamente
4. Sistema genera documento de cotización
5. Enfermera puede ajustar antes de imprimir

**Componente de cotización:**

```typescript
// components/features/medical/treatment-plan.tsx
'use client'

interface TreatmentPlanProps {
  diagnosis: DiagnosisData
  patient: Patient
  onConfirm: (plan: TreatmentPlan) => void
}

export function TreatmentPlan({ diagnosis, patient, onConfirm }: TreatmentPlanProps) {
  const [items, setItems] = useState<PlanItem[]>(() =>
    generatePlanItems(diagnosis)
  )

  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  const addItem = () => {
    setItems([...items, { id: crypto.randomUUID(), description: '', price: 0, quantity: 1 }])
  }

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
  }

  const updateItem = (id: string, updates: Partial<PlanItem>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan de Tratamiento</CardTitle>
        <CardDescription>
          Paciente: {patient.nombre_completo} - CC {patient.cedula}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead>Pierna</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio Unit.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={item.side}
                    onValueChange={(value) => updateItem(item.id, { side: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="derecha">Derecha</SelectItem>
                      <SelectItem value="izquierda">Izquierda</SelectItem>
                      <SelectItem value="ambas">Ambas</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, { quantity: parseInt(e.target.value) })}
                    className="w-20 text-right"
                  />
                </TableCell>
                <TableCell>
                  <MoneyInput
                    value={item.price}
                    onChange={(value) => updateItem(item.id, { price: value })}
                    className="w-32"
                  />
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatMoney(item.price * item.quantity)}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Button variant="outline" onClick={addItem} className="mt-4">
          <Plus className="h-4 w-4 mr-2" />
          Agregar item
        </Button>

        <Separator className="my-6" />

        <div className="flex justify-between items-center text-xl font-bold">
          <span>TOTAL ESTIMADO:</span>
          <span className="text-primary">{formatMoney(total)}</span>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => printQuote(items, patient)}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
        <Button onClick={() => onConfirm({ items, total })}>
          Confirmar Plan
        </Button>
      </CardFooter>
    </Card>
  )
}
```

---

## Modelo de Datos

```sql
-- Historia clínica principal
CREATE TABLE clinic.historias_clinicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES clinic.pacientes(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),

  -- Síntomas (checkboxes)
  sintoma_dolor BOOLEAN DEFAULT false,
  sintoma_dolor_escala INTEGER CHECK (sintoma_dolor_escala BETWEEN 1 AND 10),
  sintoma_cansancio BOOLEAN DEFAULT false,
  sintoma_calambres BOOLEAN DEFAULT false,
  sintoma_prurito BOOLEAN DEFAULT false,
  sintoma_ardor BOOLEAN DEFAULT false,
  sintoma_adormecimiento BOOLEAN DEFAULT false,
  sintoma_edema BOOLEAN DEFAULT false,
  sintoma_ulcera BOOLEAN DEFAULT false,
  sintoma_eczema BOOLEAN DEFAULT false,
  sintoma_lipodermatoesclerosis BOOLEAN DEFAULT false,

  tiempo_evolucion VARCHAR(50),

  -- Inicio relacionado
  inicio_adolescencia BOOLEAN DEFAULT false,
  inicio_embarazo BOOLEAN DEFAULT false,
  inicio_planificacion BOOLEAN DEFAULT false,
  inicio_trauma BOOLEAN DEFAULT false,
  inicio_posquirurgico BOOLEAN DEFAULT false,

  -- Antecedentes
  antecedente_diabetes BOOLEAN DEFAULT false,
  antecedente_hipertension BOOLEAN DEFAULT false,
  antecedente_hepatitis BOOLEAN DEFAULT false,
  antecedente_cardiopatia BOOLEAN DEFAULT false,
  antecedente_coagulopatia BOOLEAN DEFAULT false,
  antecedente_tvp BOOLEAN DEFAULT false,

  antecedente_familiar_padre BOOLEAN DEFAULT false,
  antecedente_familiar_madre BOOLEAN DEFAULT false,
  antecedente_familiar_hermanos BOOLEAN DEFAULT false,

  -- Gineco-obstétricos
  gineco_embarazos INTEGER,
  gineco_partos INTEGER,
  gineco_cesareas INTEGER,
  gineco_planifica BOOLEAN,
  gineco_metodo VARCHAR(50),

  -- Otros antecedentes (texto libre)
  antecedente_quirurgico TEXT,
  antecedente_alergias TEXT,
  antecedente_medicamentos TEXT,

  -- Hábitos
  habito_horas_pie INTEGER,
  habito_horas_sentado INTEGER,
  habito_ejercicio VARCHAR(20), -- nunca, ocasional, regular, frecuente
  habito_tabaquismo VARCHAR(20), -- no, exfumador, fumador
  habito_cigarrillos_dia INTEGER,
  habito_tacones VARCHAR(20), -- nunca, a veces, frecuente, siempre

  -- Observaciones
  observaciones TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Diagnósticos
CREATE TABLE clinic.diagnosticos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  historia_clinica_id UUID NOT NULL REFERENCES clinic.historias_clinicas(id),
  paciente_id UUID NOT NULL REFERENCES clinic.pacientes(id),
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Diagnóstico principal
  diagnostico_principal TEXT NOT NULL,
  clasificacion_ceap VARCHAR(10), -- C0-C6

  -- Hallazgos por miembro
  hallazgos_derecho JSONB, -- Array de hallazgos
  hallazgos_izquierdo JSONB,

  -- Transcripción original del dictado
  transcripcion_original TEXT,

  -- Estudios indicados
  indica_mapeo_duplex BOOLEAN DEFAULT false,
  indica_escaneo_duplex BOOLEAN DEFAULT false,
  indica_fotopletismografia BOOLEAN DEFAULT false,

  -- Tratamiento indicado
  indica_escleroterapia BOOLEAN DEFAULT false,
  indica_quirurgico BOOLEAN DEFAULT false,
  indica_laser BOOLEAN DEFAULT false,

  -- Medias
  indica_medias BOOLEAN DEFAULT false,
  medias_presion VARCHAR(20), -- 20-30, 30-40 mmHg
  medias_tipo VARCHAR(20), -- muslo, panty, rodilla

  -- Medicamentos
  medicamentos TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Zonas marcadas en el mapa corporal
CREATE TABLE clinic.zonas_afectadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostico_id UUID NOT NULL REFERENCES clinic.diagnosticos(id) ON DELETE CASCADE,
  zona_id VARCHAR(50) NOT NULL, -- muslo_der, pierna_izq, etc
  descripcion TEXT,
  severidad VARCHAR(20), -- leve, moderado, severo
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Permisos

| Acción | Admin | Médico | Enfermera | Secretaria |
|--------|-------|--------|-----------|------------|
| Ver historias | ✅ | ✅ | ✅ | ❌ |
| Crear historia | ✅ | ✅ | ✅ | ❌ |
| Editar historia | ✅ | ✅ (propias) | ✅ (datos básicos) | ❌ |
| Dictar diagnóstico | ✅ | ✅ | ❌ | ❌ |
| Crear diagnóstico | ✅ | ✅ | ❌ | ❌ |
| Generar cotización | ✅ | ✅ | ✅ | ❌ |
| Imprimir cotización | ✅ | ✅ | ✅ | ✅ |
