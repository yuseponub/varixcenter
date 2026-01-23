# Módulo 06: Integración con Varix Medias

## Descripción General

Sistema de integración bidireccional entre la clínica y el sistema de ventas de medias de compresión (varix-medias). Cuando el médico receta medias durante la consulta, se genera automáticamente una orden pendiente en el sistema de medias, con alertas si el paciente no realiza la compra.

## Flujo de Integración

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FLUJO CLÍNICA → MEDIAS                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  VARIX-CLINIC                           VARIX-MEDIAS                    │
│  ─────────────                          ────────────                    │
│                                                                         │
│  1. Médico prescribe       ──────▶    2. Se crea orden                 │
│     medias en consulta                   pendiente automática           │
│     (valoración/control)                                                │
│                                                                         │
│  3. Alerta en clínica      ◀──────    4. Si no compra en               │
│     si paciente no                       X días, notificar             │
│     ha comprado                                                         │
│                                                                         │
│  5. Al registrar pago      ◀──────    6. Cuando paciente              │
│     de primera sesión,                   compra, actualizar            │
│     verificar compra                     estado de orden               │
│     de medias                                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Modelo de Datos

### Tabla: integration.ordenes_medias

```sql
-- Schema para integración
CREATE SCHEMA IF NOT EXISTS integration;

CREATE TABLE integration.ordenes_medias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referencias
  paciente_id UUID NOT NULL REFERENCES clinic.pacientes(id),
  historia_id UUID REFERENCES clinic.historias_clinicas(id),
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),

  -- Prescripción
  fecha_prescripcion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo_media VARCHAR(50) NOT NULL, -- 'pantimedias', 'medias_largas', 'medias_cortas'
  compresion VARCHAR(20) NOT NULL, -- '15-20', '20-30', '30-40'
  talla VARCHAR(10) NOT NULL, -- 'S', 'M', 'L', 'XL', 'XXL'
  cantidad INTEGER NOT NULL DEFAULT 1,
  color VARCHAR(30), -- 'negro', 'beige', 'natural'
  notas TEXT, -- Instrucciones especiales

  -- Estado
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente',      -- Recién creada
    'notificada',     -- Se notificó al paciente
    'en_proceso',     -- Paciente llegó a comprar
    'completada',     -- Compra realizada
    'cancelada'       -- Cancelada por médico
  )),

  -- Tracking de compra (desde varix-medias)
  varix_pedido_id UUID, -- ID del pedido en varix-medias cuando se complete
  fecha_compra TIMESTAMPTZ,
  monto_venta DECIMAL(12,2),

  -- Alertas
  ultima_alerta TIMESTAMPTZ,
  alertas_enviadas INTEGER DEFAULT 0,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_ordenes_medias_paciente ON integration.ordenes_medias(paciente_id);
CREATE INDEX idx_ordenes_medias_estado ON integration.ordenes_medias(estado);
CREATE INDEX idx_ordenes_medias_pendientes ON integration.ordenes_medias(estado, fecha_prescripcion)
  WHERE estado IN ('pendiente', 'notificada');
```

### Tabla: integration.sync_log

```sql
-- Log de sincronización entre sistemas
CREATE TABLE integration.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origen VARCHAR(20) NOT NULL, -- 'clinic' o 'medias'
  destino VARCHAR(20) NOT NULL,
  tipo_evento VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  error_mensaje TEXT,
  reintentos INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_log_pendiente ON integration.sync_log(estado, created_at)
  WHERE estado = 'pendiente';
```

## API de Integración

### Webhook desde Varix-Medias

Varix-Medias envía notificaciones cuando hay eventos relevantes:

```typescript
// app/api/webhooks/varix-medias/route.ts
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const WEBHOOK_SECRET = process.env.VARIX_MEDIAS_WEBHOOK_SECRET!

// Verificar firma del webhook
function verifySignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  )
}

export async function POST(request: Request) {
  const headersList = await headers()
  const signature = headersList.get('x-varix-signature')
  const body = await request.text()

  // Verificar autenticidad
  if (!signature || !verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body)
  const supabase = await createClient()

  // Registrar evento
  await supabase.from('integration.sync_log').insert({
    origen: 'medias',
    destino: 'clinic',
    tipo_evento: event.type,
    payload: event,
  })

  switch (event.type) {
    case 'venta.completada':
      // Actualizar orden de medias
      await supabase
        .from('integration.ordenes_medias')
        .update({
          estado: 'completada',
          varix_pedido_id: event.data.pedido_id,
          fecha_compra: event.data.fecha,
          monto_venta: event.data.monto,
          updated_at: new Date().toISOString(),
        })
        .eq('paciente_id', event.data.paciente_id)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
        .limit(1)
      break

    case 'paciente.llegada':
      // Paciente llegó a la tienda
      await supabase
        .from('integration.ordenes_medias')
        .update({
          estado: 'en_proceso',
          updated_at: new Date().toISOString(),
        })
        .eq('paciente_id', event.data.paciente_id)
        .eq('estado', 'pendiente')
      break

    default:
      console.log('Evento no manejado:', event.type)
  }

  return NextResponse.json({ received: true })
}
```

### API para Varix-Medias

```typescript
// app/api/medias/ordenes/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Obtener órdenes pendientes para Varix-Medias
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const apiKey = request.headers.get('x-api-key')

  // Verificar API key
  if (apiKey !== process.env.VARIX_MEDIAS_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('integration.ordenes_medias')
    .select(`
      *,
      paciente:pacientes(
        id,
        nombre_completo,
        documento,
        telefono,
        email
      ),
      medico:usuarios(
        id,
        nombre_completo
      )
    `)
    .in('estado', ['pendiente', 'notificada'])
    .order('fecha_prescripcion', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ordenes: data })
}
```

## Server Actions

### actions/medias-integration.ts

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Prescribir medias desde la consulta
export async function prescribirMedias(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const data = {
    paciente_id: formData.get('paciente_id') as string,
    historia_id: formData.get('historia_id') as string | null,
    medico_id: user.id,
    tipo_media: formData.get('tipo_media') as string,
    compresion: formData.get('compresion') as string,
    talla: formData.get('talla') as string,
    cantidad: parseInt(formData.get('cantidad') as string) || 1,
    color: formData.get('color') as string | null,
    notas: formData.get('notas') as string | null,
  }

  const { data: orden, error } = await supabase
    .from('ordenes_medias')
    .insert(data)
    .select()
    .single()

  if (error) throw error

  // Notificar a Varix-Medias
  await notificarNuevaOrden(orden)

  revalidatePath('/consulta')
  return orden
}

// Notificar nueva orden al sistema de medias
async function notificarNuevaOrden(orden: any) {
  const supabase = await createClient()

  // Obtener datos completos del paciente
  const { data: paciente } = await supabase
    .from('pacientes')
    .select('*')
    .eq('id', orden.paciente_id)
    .single()

  // Enviar webhook a Varix-Medias
  try {
    const response = await fetch(process.env.VARIX_MEDIAS_WEBHOOK_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.VARIX_MEDIAS_API_KEY!,
      },
      body: JSON.stringify({
        type: 'orden.nueva',
        data: {
          orden_id: orden.id,
          paciente: {
            id: paciente.id,
            nombre: paciente.nombre_completo,
            documento: paciente.documento,
            telefono: paciente.telefono,
          },
          prescripcion: {
            tipo: orden.tipo_media,
            compresion: orden.compresion,
            talla: orden.talla,
            cantidad: orden.cantidad,
            color: orden.color,
            notas: orden.notas,
          },
          fecha_prescripcion: orden.fecha_prescripcion,
        },
      }),
    })

    if (!response.ok) {
      throw new Error('Error al notificar a Varix-Medias')
    }

    // Marcar como notificada
    await supabase
      .from('ordenes_medias')
      .update({ estado: 'notificada' })
      .eq('id', orden.id)

  } catch (error) {
    // Registrar error para reintento
    await supabase.from('sync_log').insert({
      origen: 'clinic',
      destino: 'medias',
      tipo_evento: 'orden.nueva',
      payload: orden,
      estado: 'error',
      error_mensaje: String(error),
    })
  }
}

// Obtener órdenes pendientes de un paciente
export async function obtenerOrdenesPendientes(pacienteId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ordenes_medias')
    .select('*')
    .eq('paciente_id', pacienteId)
    .in('estado', ['pendiente', 'notificada'])
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// Verificar si paciente tiene medias pendientes
export async function verificarMediasPendientes(pacienteId: string) {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('ordenes_medias')
    .select('*', { count: 'exact', head: true })
    .eq('paciente_id', pacienteId)
    .in('estado', ['pendiente', 'notificada'])

  if (error) throw error
  return { tienePendientes: (count || 0) > 0, cantidad: count || 0 }
}

// Cancelar orden de medias
export async function cancelarOrdenMedias(ordenId: string, motivo: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data, error } = await supabase
    .from('ordenes_medias')
    .update({
      estado: 'cancelada',
      notas: motivo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ordenId)
    .select()
    .single()

  if (error) throw error

  // Notificar cancelación
  await fetch(process.env.VARIX_MEDIAS_WEBHOOK_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.VARIX_MEDIAS_API_KEY!,
    },
    body: JSON.stringify({
      type: 'orden.cancelada',
      data: { orden_id: ordenId, motivo },
    }),
  })

  revalidatePath('/consulta')
  return data
}
```

## Componentes UI

### Formulario de Prescripción de Medias

```tsx
// components/medias/formulario-prescripcion.tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { prescribirMedias } from '@/actions/medias-integration'

const prescripcionSchema = z.object({
  tipo_media: z.enum(['pantimedias', 'medias_largas', 'medias_cortas']),
  compresion: z.enum(['15-20', '20-30', '30-40']),
  talla: z.enum(['S', 'M', 'L', 'XL', 'XXL']),
  cantidad: z.number().min(1).max(10),
  color: z.string().optional(),
  notas: z.string().optional(),
})

const TIPOS_MEDIA = [
  { value: 'pantimedias', label: 'Pantimedias' },
  { value: 'medias_largas', label: 'Medias Largas (Muslo)' },
  { value: 'medias_cortas', label: 'Medias Cortas (Rodilla)' },
]

const COMPRESIONES = [
  { value: '15-20', label: '15-20 mmHg (Ligera)' },
  { value: '20-30', label: '20-30 mmHg (Moderada)' },
  { value: '30-40', label: '30-40 mmHg (Alta)' },
]

const TALLAS = ['S', 'M', 'L', 'XL', 'XXL']

const COLORES = [
  { value: 'negro', label: 'Negro' },
  { value: 'beige', label: 'Beige' },
  { value: 'natural', label: 'Natural' },
]

interface Props {
  pacienteId: string
  historiaId?: string
  onPrescribed?: () => void
}

export function FormularioPrescripcionMedias({
  pacienteId,
  historiaId,
  onPrescribed
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const form = useForm({
    resolver: zodResolver(prescripcionSchema),
    defaultValues: {
      tipo_media: 'medias_cortas' as const,
      compresion: '20-30' as const,
      talla: 'M' as const,
      cantidad: 1,
      color: 'negro',
      notas: '',
    },
  })

  const onSubmit = async (data: z.infer<typeof prescripcionSchema>) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.set('paciente_id', pacienteId)
      if (historiaId) formData.set('historia_id', historiaId)
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) formData.set(key, String(value))
      })

      await prescribirMedias(formData)
      setOpen(false)
      form.reset()
      onPrescribed?.()
    } catch (error) {
      console.error(error)
      alert('Error al prescribir medias')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          Prescribir Medias
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Prescribir Medias de Compresión</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Tipo de media */}
          <div className="space-y-2">
            <Label>Tipo de Media</Label>
            <Select
              value={form.watch('tipo_media')}
              onValueChange={(v) => form.setValue('tipo_media', v as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_MEDIA.map(tipo => (
                  <SelectItem key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Compresión */}
          <div className="space-y-2">
            <Label>Nivel de Compresión</Label>
            <Select
              value={form.watch('compresion')}
              onValueChange={(v) => form.setValue('compresion', v as any)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPRESIONES.map(comp => (
                  <SelectItem key={comp.value} value={comp.value}>
                    {comp.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Talla y Color */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Talla</Label>
              <Select
                value={form.watch('talla')}
                onValueChange={(v) => form.setValue('talla', v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TALLAS.map(talla => (
                    <SelectItem key={talla} value={talla}>
                      {talla}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <Select
                value={form.watch('color')}
                onValueChange={(v) => form.setValue('color', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLORES.map(color => (
                    <SelectItem key={color.value} value={color.value}>
                      {color.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cantidad */}
          <div className="space-y-2">
            <Label>Cantidad de Pares</Label>
            <Input
              type="number"
              min={1}
              max={10}
              {...form.register('cantidad', { valueAsNumber: true })}
            />
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label>Instrucciones Especiales</Label>
            <Textarea
              {...form.register('notas')}
              placeholder="Indicaciones adicionales..."
              rows={2}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Procesando...' : 'Generar Orden'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

### Alerta de Medias Pendientes

```tsx
// components/medias/alerta-medias-pendientes.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ShoppingBag } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { verificarMediasPendientes } from '@/actions/medias-integration'

interface Props {
  pacienteId: string
}

export function AlertaMediasPendientes({ pacienteId }: Props) {
  const { data } = useQuery({
    queryKey: ['medias-pendientes', pacienteId],
    queryFn: () => verificarMediasPendientes(pacienteId),
  })

  if (!data?.tienePendientes) return null

  return (
    <Alert variant="warning" className="border-orange-300 bg-orange-50">
      <ShoppingBag className="h-4 w-4 text-orange-600" />
      <AlertTitle className="text-orange-800">
        Medias Pendientes de Compra
      </AlertTitle>
      <AlertDescription className="text-orange-700">
        Este paciente tiene {data.cantidad} orden(es) de medias de compresión
        pendiente(s). Verificar con el paciente si ya realizó la compra.
        <div className="mt-2">
          <Button variant="outline" size="sm">
            Ver Órdenes Pendientes
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
```

### Lista de Órdenes del Paciente

```tsx
// components/medias/ordenes-paciente.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle, Clock, XCircle, ShoppingCart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { obtenerOrdenesPendientes } from '@/actions/medias-integration'

const ESTADO_CONFIG = {
  pendiente: { icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
  notificada: { icon: ShoppingCart, color: 'bg-blue-100 text-blue-800' },
  en_proceso: { icon: ShoppingCart, color: 'bg-purple-100 text-purple-800' },
  completada: { icon: CheckCircle, color: 'bg-green-100 text-green-800' },
  cancelada: { icon: XCircle, color: 'bg-red-100 text-red-800' },
}

interface Props {
  pacienteId: string
}

export function OrdenesPaciente({ pacienteId }: Props) {
  const { data: ordenes, isLoading } = useQuery({
    queryKey: ['ordenes-medias', pacienteId],
    queryFn: () => obtenerOrdenesPendientes(pacienteId),
  })

  if (isLoading) return <div>Cargando...</div>
  if (!ordenes?.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Órdenes de Medias</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ordenes.map((orden: any) => {
          const config = ESTADO_CONFIG[orden.estado as keyof typeof ESTADO_CONFIG]
          const Icon = config.icon

          return (
            <div
              key={orden.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="font-medium">
                    {orden.tipo_media} - {orden.compresion} mmHg
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Talla {orden.talla} • {orden.cantidad} par(es)
                    {orden.color && ` • ${orden.color}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Prescrito: {format(new Date(orden.fecha_prescripcion), "d 'de' MMM", { locale: es })}
                  </p>
                </div>
              </div>
              <Badge className={config.color}>
                {orden.estado}
              </Badge>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
```

## Cron Job: Alertas de Órdenes Pendientes

```typescript
// app/api/cron/alertas-medias/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Verificar que viene de Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // Buscar órdenes pendientes de más de 3 días
  const tresDiasAtras = new Date()
  tresDiasAtras.setDate(tresDiasAtras.getDate() - 3)

  const { data: ordenesPendientes } = await supabase
    .from('ordenes_medias')
    .select(`
      *,
      paciente:pacientes(nombre_completo, telefono)
    `)
    .in('estado', ['pendiente', 'notificada'])
    .lt('fecha_prescripcion', tresDiasAtras.toISOString())
    .lt('alertas_enviadas', 3)

  // Enviar alertas por cada orden
  for (const orden of ordenesPendientes || []) {
    // Aquí se enviaría SMS/WhatsApp/Email
    console.log(`Alerta para orden ${orden.id} - Paciente: ${orden.paciente?.nombre_completo}`)

    // Actualizar contador de alertas
    await supabase
      .from('ordenes_medias')
      .update({
        ultima_alerta: new Date().toISOString(),
        alertas_enviadas: orden.alertas_enviadas + 1,
      })
      .eq('id', orden.id)
  }

  return NextResponse.json({
    processed: ordenesPendientes?.length || 0,
  })
}
```

## Configuración en vercel.json

```json
{
  "crons": [
    {
      "path": "/api/cron/alertas-medias",
      "schedule": "0 9 * * *"
    }
  ]
}
```

## Variables de Entorno Requeridas

```env
# Integración con Varix-Medias
VARIX_MEDIAS_API_KEY=your-api-key-here
VARIX_MEDIAS_WEBHOOK_URL=https://varix-medias.vercel.app/api/webhooks/clinic
VARIX_MEDIAS_WEBHOOK_SECRET=your-webhook-secret-here

# Cron Jobs
CRON_SECRET=your-cron-secret-here
```

## Prompt para v0.dev

```
Crear un componente de prescripción de medias de compresión para uso médico en tablet:

Modal de prescripción con campos:
- Tipo de media: dropdown (Pantimedias, Largas, Cortas)
- Compresión: dropdown con opciones 15-20/20-30/30-40 mmHg con descripción
- Talla: selector visual S/M/L/XL/XXL
- Cantidad: input numérico con +/- buttons
- Color: chips seleccionables (Negro, Beige, Natural)
- Notas: textarea para instrucciones especiales

Alerta de medias pendientes:
- Banner amarillo/naranja que aparece en la ficha del paciente
- Icono de bolsa de compras
- Texto indicando órdenes pendientes
- Botón para ver detalles

Lista de órdenes:
- Cards con cada orden prescrita
- Mostrar: tipo, compresión, talla, cantidad, color
- Badge de estado con color
- Fecha de prescripción

Stack: React, TypeScript, shadcn/ui, Tailwind CSS
```

---

## Próximo: [07_REPORTES.md](./07_REPORTES.md)
