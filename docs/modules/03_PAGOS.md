# Módulo: Pagos y Facturación

## Descripción General

El módulo de Pagos es crítico para el sistema ya que es donde históricamente han ocurrido las pérdidas de dinero. Implementa controles estrictos: foto obligatoria, números de factura automáticos, registros inmutables y auditoría completa.

---

## Principios de Seguridad

### 1. INMUTABILIDAD
- Los pagos **NO SE PUEDEN MODIFICAR** después de creados
- No hay UPDATE en la tabla de pagos
- Solo ADMIN puede eliminar (con justificación obligatoria)

### 2. TRAZABILIDAD
- Cada pago tiene foto del recibo (obligatoria)
- Número de factura automático y consecutivo
- Registro de quién cobró y cuándo
- Auditoría automática vía triggers

### 3. OBLIGATORIEDAD
- No se puede registrar pago sin foto
- No se puede saltar números de factura
- El sistema calcula totales (no el usuario)

---

## Funcionalidades

### 1. Registrar Pago

**Flujo:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                      FLUJO DE REGISTRO DE PAGO                      │
└─────────────────────────────────────────────────────────────────────┘

  SECRETARIA                           SISTEMA
      │                                   │
      │  Buscar paciente                  │
      │──────────────────────────────────>│
      │                                   │
      │  Paciente encontrado              │
      │<──────────────────────────────────│
      │                                   │
      │  Seleccionar servicio(s)          │
      │──────────────────────────────────>│
      │                                   │
      │                              ┌────┴────┐
      │                              │ Calcula │
      │                              │ total   │
      │                              │automátic│
      │                              └────┬────┘
      │                                   │
      │  Total calculado: $190.000        │
      │<──────────────────────────────────│
      │                                   │
      │  Seleccionar método de pago       │
      │──────────────────────────────────>│
      │                                   │
      │  TOMAR FOTO DEL RECIBO            │
      │  (OBLIGATORIO)                    │
      │──────────────────────────────────>│
      │                                   │
      │                              ┌────┴────┐
      │                              │ Sube    │
      │                              │ foto a  │
      │                              │ Storage │
      │                              └────┬────┘
      │                                   │
      │  Click "Registrar Pago"           │
      │──────────────────────────────────>│
      │                                   │
      │                              ┌────┴────┐
      │                              │ Genera  │
      │                              │ número  │
      │                              │ factura │
      │                              │ automát.│
      │                              └────┬────┘
      │                                   │
      │                              ┌────┴────┐
      │                              │ INSERT  │
      │                              │ pago    │
      │                              │(inmutab)│
      │                              └────┬────┘
      │                                   │
      │                              ┌────┴────┐
      │                              │ TRIGGER │
      │                              │ audit   │
      │                              │ log     │
      │                              └────┬────┘
      │                                   │
      │  ✓ Pago registrado                │
      │  Factura #39390                   │
      │<──────────────────────────────────│
      │                                   │
      │  Imprimir factura (opcional)      │
      │──────────────────────────────────>│
      │                                   │
```

---

### 2. Interfaz de Registro de Pago

```
┌─────────────────────────────────────────────────────────────────────┐
│ [←] Registrar Pago                                      [Registrar] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PACIENTE                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Buscar paciente...                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ✓ Mayarlandez Gutierrez Bayona                              │   │
│  │   CC 37.840.063 │ Plan activo: $1.460.000 pendiente         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════   │
│                                                                     │
│  SERVICIOS                                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │  CONSULTAS                                                  │   │
│  │  ○ Valoración                              $100.000         │   │
│  │  ○ Control                                 $110.000         │   │
│  │  ○ Scaneo                                  $95.000          │   │
│  │                                                             │   │
│  │  DIAGNÓSTICO                                                │   │
│  │  ○ Duplex 1 pierna                         $180.000         │   │
│  │  ○ Duplex 2 piernas                        $260.000         │   │
│  │                                                             │   │
│  │  ESCLEROTERAPIA                                             │   │
│  │  ● Sesiones piernas         x [2]          $190.000         │   │
│  │  ○ Sesiones cara            x [ ]          $0               │   │
│  │  ○ Sesiones manos           x [ ]          $0               │   │
│  │                                                             │   │
│  │  ECOREABSORCIÓN                                             │   │
│  │  ○ Perforante/Ramita                       $250.000-350.000│   │
│  │  ○ Safena Externa                          $1.200.000       │   │
│  │  ○ Safena Interna                          $1.600.000+      │   │
│  │                                                             │   │
│  │  OTROS                                                      │   │
│  │  ○ Personalizado           [___________]   $[________]      │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │   SUBTOTAL:                                    $190.000     │   │
│  │   Descuento:                                   $0           │   │
│  │   ─────────────────────────────────────────────────────     │   │
│  │   TOTAL A PAGAR:                              $190.000      │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════   │
│                                                                     │
│  MÉTODO DE PAGO                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │ ● 💵    │ │ ○ 💳    │ │ ○ 🏦    │ │ ○ 📱    │                   │
│  │ Efectivo│ │ Tarjeta │ │Transfer.│ │  Nequi  │                   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                   │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════   │
│                                                                     │
│  FOTO DEL RECIBO (OBLIGATORIO)                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │                    ┌───────────────┐                        │   │
│  │                    │               │                        │   │
│  │                    │   📷          │                        │   │
│  │                    │  Tomar foto   │                        │   │
│  │                    │               │                        │   │
│  │                    └───────────────┘                        │   │
│  │                                                             │   │
│  │  ⚠️ Debe tomar foto del recibo antes de registrar          │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Observaciones (opcional):                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│            ┌─────────────────────────────────────┐                  │
│            │       REGISTRAR PAGO $190.000       │                  │
│            │           (deshabilitado sin foto)  │                  │
│            └─────────────────────────────────────┘                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 3. Captura de Foto del Recibo

```typescript
// components/shared/photo-capture.tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import { Camera, X, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PhotoCaptureProps {
  label: string
  required?: boolean
  onCapture: (file: File, preview: string) => void
  onClear?: () => void
}

export function PhotoCapture({ label, required, onCapture, onClear }: PhotoCaptureProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Cámara trasera
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setIsCapturing(true)
    } catch (error) {
      console.error('Error accessing camera:', error)
      // Fallback a input file
      document.getElementById('file-input')?.click()
    }
  }

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context?.drawImage(video, 0, 0)

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `recibo_${Date.now()}.jpg`, { type: 'image/jpeg' })
          const previewUrl = URL.createObjectURL(blob)
          setPreview(previewUrl)
          onCapture(file, previewUrl)
        }
      }, 'image/jpeg', 0.8)

      stopCamera()
    }
  }, [onCapture])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCapturing(false)
  }

  const clearPhoto = () => {
    setPreview(null)
    onClear?.()
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const previewUrl = URL.createObjectURL(file)
      setPreview(previewUrl)
      onCapture(file, previewUrl)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      </div>

      {!preview && !isCapturing && (
        <div
          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={startCamera}
        >
          <Camera className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Toca para tomar foto
          </p>
          <input
            id="file-input"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      )}

      {isCapturing && (
        <div className="relative rounded-lg overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full"
          />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            <Button variant="secondary" onClick={stopCamera}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={capturePhoto}>
              <Camera className="h-4 w-4 mr-2" />
              Capturar
            </Button>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {preview && (
        <div className="relative rounded-lg overflow-hidden">
          <img
            src={preview}
            alt="Preview del recibo"
            className="w-full h-48 object-cover"
          />
          <Button
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2"
            onClick={clearPhoto}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-2 right-2"
            onClick={startCamera}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Retomar
          </Button>
        </div>
      )}

      {required && !preview && (
        <p className="text-sm text-destructive">
          ⚠️ La foto del recibo es obligatoria
        </p>
      )}
    </div>
  )
}
```

---

### 4. Historial de Pagos

```
┌─────────────────────────────────────────────────────────────────────┐
│ [←] Historial de Pagos                            [Exportar Excel] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FILTROS                                                            │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────┐   │
│  │ Hoy    ▼ │ │ Método ▼ │ │ Usuario ▼│ │ 🔍 Buscar...      │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────────────┘   │
│                                                                     │
│  RESUMEN DEL PERÍODO                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Total: $9.425.000  │  Efectivo: $1.615.000  │  Tarjeta: $7.810.000  │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ # Factura │ Hora  │ Paciente        │ Concepto    │ Total   │ │   │
│  ├───────────┼───────┼─────────────────┼─────────────┼─────────┤   │
│  │ 39390     │ 15:30 │ María García    │ Valoración  │ $100k   │ 📷│
│  │ 39389     │ 14:45 │ Carmen López    │ 3 Sesiones  │ $285k   │ 📷│
│  │ 39388     │ 14:00 │ Ana Martínez    │ Control     │ $110k   │ 📷│
│  │ 39387     │ 13:15 │ Rosa Pérez      │ ECOR        │ $250k   │ 📷│
│  │ 39386     │ 12:30 │ Luisa Rodríguez │ 2 Sesiones  │ $190k   │ 📷│
│  │ ...       │       │                 │             │         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [< Anterior]  Página 1 de 5  [Siguiente >]                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Al hacer clic en un pago:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DETALLE DEL PAGO                        [X]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Factura: #39390                                                    │
│  Fecha: 23/01/2026 15:30                                           │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│  PACIENTE                                                           │
│  María García López                                                 │
│  CC 52.123.456                                                      │
│                                                                     │
│  CONCEPTO                                                           │
│  Valoración inicial                                                 │
│                                                                     │
│  TOTAL                                                              │
│  $100.000                                                           │
│                                                                     │
│  MÉTODO DE PAGO                                                     │
│  💵 Efectivo                                                        │
│                                                                     │
│  COBRADO POR                                                        │
│  Laura Gómez (Secretaria)                                           │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│  FOTO DEL RECIBO                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │                      [Imagen del recibo]                    │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Ver imagen completa]  [Imprimir factura]                         │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│  AUDITORÍA                                                          │
│  Creado: 23/01/2026 15:30:45 por Laura Gómez                       │
│  IP: 192.168.1.100                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 5. Anulación de Pagos (Solo Admin)

**Requiere:**
- Usuario con rol ADMIN
- Motivo de anulación obligatorio
- Registro en auditoría

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ANULAR PAGO                              [X]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ⚠️ ADVERTENCIA                                                     │
│  Esta acción es irreversible y quedará registrada                  │
│  en el log de auditoría.                                           │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│  Pago a anular:                                                     │
│  Factura #39390 - $100.000 - María García                          │
│                                                                     │
│  Motivo de anulación (obligatorio):                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Error en el registro, el paciente pagó con tarjeta no      │   │
│  │ efectivo. Se registrará nuevo pago correcto.               │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ───────────────────────────────────────────────────────────────   │
│                                                                     │
│  Contraseña de administrador:                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ••••••••••                                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│            [Cancelar]            [Confirmar Anulación]              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Modelo de Datos

```sql
-- Secuencia para números de factura
CREATE SEQUENCE clinic.factura_seq START 39390;

-- Tabla de pagos (INMUTABLE - sin UPDATE)
CREATE TABLE clinic.pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Número de factura automático
  numero_factura VARCHAR(20) UNIQUE NOT NULL DEFAULT ('FAC-' || nextval('clinic.factura_seq')),

  -- Fecha y hora
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  hora TIME NOT NULL DEFAULT CURRENT_TIME,

  -- Paciente
  paciente_id UUID NOT NULL REFERENCES clinic.pacientes(id),

  -- Plan de tratamiento (opcional, para vincular con plan)
  plan_id UUID REFERENCES clinic.planes_tratamiento(id),

  -- Concepto
  concepto TEXT NOT NULL,
  detalle JSONB, -- Array de items si son múltiples servicios

  -- Montos
  subtotal DECIMAL(12,2) NOT NULL,
  descuento DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,

  -- Método de pago
  metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia', 'nequi')),

  -- Fotos (OBLIGATORIAS)
  foto_recibo_url TEXT NOT NULL,
  foto_comprobante_url TEXT, -- Para tarjeta/transferencia

  -- Quién cobró
  cobrado_por UUID NOT NULL REFERENCES clinic.usuarios(id),

  -- Observaciones
  observaciones TEXT,

  -- Estado (para anulaciones)
  estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  anulado_por UUID REFERENCES clinic.usuarios(id),
  anulado_at TIMESTAMPTZ,
  motivo_anulacion TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
  -- NO hay updated_at - los pagos son inmutables
);

-- Índices
CREATE INDEX idx_pagos_fecha ON clinic.pagos(fecha);
CREATE INDEX idx_pagos_paciente ON clinic.pagos(paciente_id);
CREATE INDEX idx_pagos_metodo ON clinic.pagos(metodo_pago);
CREATE INDEX idx_pagos_cobrado_por ON clinic.pagos(cobrado_por);

-- Trigger para evitar UPDATE (excepto anulación)
CREATE OR REPLACE FUNCTION clinic.prevent_pago_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo permitir actualizar estado para anulación
  IF OLD.estado = 'activo' AND NEW.estado = 'anulado' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Los pagos no pueden ser modificados. Solo se pueden anular.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_pago_update
  BEFORE UPDATE ON clinic.pagos
  FOR EACH ROW
  EXECUTE FUNCTION clinic.prevent_pago_update();

-- Trigger de auditoría
CREATE OR REPLACE FUNCTION clinic.audit_pago()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit.logs (
    tabla,
    registro_id,
    accion,
    datos_nuevos,
    usuario_id
  ) VALUES (
    'pagos',
    NEW.id,
    TG_OP,
    row_to_json(NEW),
    NEW.cobrado_por
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_pago
  AFTER INSERT ON clinic.pagos
  FOR EACH ROW
  EXECUTE FUNCTION clinic.audit_pago();
```

---

## Server Actions

```typescript
// app/actions/pagos.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { pagoSchema } from '@/lib/validations/pago'
import { revalidatePath } from 'next/cache'

export async function createPago(formData: FormData) {
  const supabase = await createClient()

  // Obtener usuario actual
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Obtener datos del usuario (para el ID interno)
  const { data: userData } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_id', user.id)
    .single()

  if (!userData) {
    return { error: 'Usuario no encontrado' }
  }

  // Validar datos
  const rawData = {
    paciente_id: formData.get('paciente_id'),
    concepto: formData.get('concepto'),
    detalle: JSON.parse(formData.get('detalle') as string || '[]'),
    subtotal: parseFloat(formData.get('subtotal') as string),
    descuento: parseFloat(formData.get('descuento') as string || '0'),
    total: parseFloat(formData.get('total') as string),
    metodo_pago: formData.get('metodo_pago'),
    observaciones: formData.get('observaciones'),
  }

  const validated = pagoSchema.parse(rawData)

  // Verificar que hay foto
  const fotoRecibo = formData.get('foto_recibo') as File
  if (!fotoRecibo || fotoRecibo.size === 0) {
    return { error: 'La foto del recibo es obligatoria' }
  }

  // Subir foto a Storage
  const fileName = `${Date.now()}_${fotoRecibo.name}`
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('recibos')
    .upload(fileName, fotoRecibo)

  if (uploadError) {
    return { error: 'Error al subir la foto' }
  }

  // Obtener URL pública
  const { data: { publicUrl } } = supabase.storage
    .from('recibos')
    .getPublicUrl(fileName)

  // Insertar pago
  const { data: pago, error } = await supabase
    .from('pagos')
    .insert({
      ...validated,
      foto_recibo_url: publicUrl,
      cobrado_por: userData.id,
    })
    .select()
    .single()

  if (error) {
    return { error: 'Error al registrar el pago' }
  }

  revalidatePath('/pagos')
  revalidatePath('/caja')

  return { success: true, data: pago }
}

export async function anularPago(pagoId: string, motivo: string, password: string) {
  const supabase = await createClient()

  // Verificar que es admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  const { data: userData } = await supabase
    .from('usuarios')
    .select('id, rol')
    .eq('auth_id', user.id)
    .single()

  if (!userData || userData.rol !== 'admin') {
    return { error: 'Solo administradores pueden anular pagos' }
  }

  // Verificar contraseña
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  })

  if (signInError) {
    return { error: 'Contraseña incorrecta' }
  }

  // Anular pago
  const { error } = await supabase
    .from('pagos')
    .update({
      estado: 'anulado',
      anulado_por: userData.id,
      anulado_at: new Date().toISOString(),
      motivo_anulacion: motivo,
    })
    .eq('id', pagoId)
    .eq('estado', 'activo') // Solo si está activo

  if (error) {
    return { error: 'Error al anular el pago' }
  }

  // Registrar en auditoría (ya lo hace el trigger, pero agregamos detalle extra)
  await supabase.from('audit.logs').insert({
    tabla: 'pagos',
    registro_id: pagoId,
    accion: 'anulacion',
    datos_nuevos: { motivo },
    usuario_id: userData.id,
  })

  revalidatePath('/pagos')
  revalidatePath('/caja')

  return { success: true }
}
```

---

## Validaciones

```typescript
// lib/validations/pago.ts
import { z } from 'zod'

export const pagoSchema = z.object({
  paciente_id: z.string().uuid('Debe seleccionar un paciente'),

  concepto: z
    .string()
    .min(3, 'El concepto es muy corto')
    .max(200, 'El concepto es muy largo'),

  detalle: z.array(z.object({
    servicio: z.string(),
    cantidad: z.number().min(1),
    precio_unitario: z.number().min(0),
    subtotal: z.number().min(0),
  })).optional(),

  subtotal: z
    .number()
    .min(0, 'El subtotal no puede ser negativo'),

  descuento: z
    .number()
    .min(0, 'El descuento no puede ser negativo')
    .default(0),

  total: z
    .number()
    .min(1, 'El total debe ser mayor a 0'),

  metodo_pago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'nequi'], {
    errorMap: () => ({ message: 'Seleccione un método de pago válido' }),
  }),

  observaciones: z.string().max(500).optional(),
})
.refine((data) => data.total === data.subtotal - data.descuento, {
  message: 'El total no coincide con subtotal - descuento',
  path: ['total'],
})

export type PagoInput = z.infer<typeof pagoSchema>
```

---

## Permisos

| Acción | Admin | Médico | Enfermera | Secretaria |
|--------|-------|--------|-----------|------------|
| Ver pagos (propios) | ✅ | ❌ | ❌ | ✅ |
| Ver todos los pagos | ✅ | ❌ | ❌ | ❌ |
| Registrar pago | ✅ | ❌ | ❌ | ✅ |
| Ver foto del recibo | ✅ | ❌ | ❌ | ✅ |
| Anular pago | ✅ | ❌ | ❌ | ❌ |
| Hacer descuento | ✅ | ❌ | ❌ | ❌ |
| Exportar datos | ✅ | ❌ | ❌ | ❌ |

---

## Impresión de Factura

**Plantilla para impresora térmica (80mm):**

```
================================
      VARIX CENTER
  Centro Médico Flebológico
================================
CRA. 34 N° 52-125 Piso 2
Tel: 6436810 - 3162814531
Bucaramanga, Colombia
--------------------------------
FACTURA DE VENTA
N°: FAC-39390
Fecha: 23/01/2026 15:30
--------------------------------
Paciente: María García López
CC: 52.123.456
--------------------------------
DETALLE:
1x Valoración        $100.000
--------------------------------
SUBTOTAL:            $100.000
DESCUENTO:                 $0
--------------------------------
TOTAL:               $100.000
================================
Método de pago: EFECTIVO
Atendido por: Laura Gómez
================================
     ¡Gracias por su visita!

   Conserve este comprobante
================================
```
