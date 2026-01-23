# Módulo 05: Cierre de Caja

## Descripción General

Sistema de cierre de caja diario que permite cuadrar los ingresos del día, verificar que todos los pagos estén correctamente registrados con sus comprobantes fotográficos, y generar reportes para la administración. Este módulo es crítico para el control anti-fraude.

## Reglas de Negocio

### Proceso de Cierre

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESO DE CIERRE DIARIO                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. APERTURA DE CAJA (Inicio del día)                          │
│     • Registrar base inicial en efectivo                       │
│     • Foto del dinero base (opcional)                          │
│     • Verificar impresora de recibos                           │
│                                                                 │
│  2. OPERACIONES DEL DÍA (Automático)                           │
│     • Cada pago se registra con foto obligatoria               │
│     • Número de recibo auto-generado                           │
│     • Método de pago (efectivo/tarjeta/transferencia)          │
│                                                                 │
│  3. PRE-CIERRE (Antes de cerrar)                               │
│     • Sistema muestra totales por método de pago               │
│     • Conteo de efectivo físico                                │
│     • Comparación sistema vs físico                            │
│                                                                 │
│  4. CIERRE FINAL                                               │
│     • Justificar diferencias (si las hay)                      │
│     • Foto del conteo final                                    │
│     • Firma digital del responsable                            │
│     • Bloqueo de modificaciones                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Validaciones de Seguridad

| Regla | Descripción |
|-------|-------------|
| Foto obligatoria | Todo pago en efectivo debe tener foto del dinero |
| Recibo obligatorio | Todo pago con tarjeta debe tener foto del voucher |
| Transferencia | Debe tener captura de pantalla de confirmación |
| Diferencias | Cualquier diferencia > $10,000 requiere justificación |
| Anulaciones | Solo administrador puede anular pagos |
| Cierre único | Solo se puede cerrar una vez por día |

## Modelo de Datos

### Tabla: clinic.cajas

```sql
CREATE TABLE clinic.cajas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL UNIQUE,

  -- Apertura
  base_inicial DECIMAL(12,2) NOT NULL DEFAULT 0,
  apertura_foto_url TEXT,
  apertura_hora TIMESTAMPTZ,
  apertura_por UUID REFERENCES clinic.usuarios(id),

  -- Totales calculados (se actualizan con trigger)
  total_efectivo DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_tarjeta DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_transferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_anulaciones DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Cierre
  efectivo_contado DECIMAL(12,2),
  diferencia DECIMAL(12,2),
  justificacion_diferencia TEXT,
  cierre_foto_url TEXT,
  cierre_hora TIMESTAMPTZ,
  cierre_por UUID REFERENCES clinic.usuarios(id),

  -- Estado
  estado VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (estado IN (
    'abierta', 'en_cierre', 'cerrada'
  )),

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda por fecha
CREATE UNIQUE INDEX idx_cajas_fecha ON clinic.cajas(fecha);
```

### Trigger: Actualizar Totales de Caja

```sql
CREATE OR REPLACE FUNCTION clinic.actualizar_totales_caja()
RETURNS TRIGGER AS $$
DECLARE
  pago_fecha DATE;
BEGIN
  -- Determinar la fecha del pago
  IF TG_OP = 'DELETE' THEN
    pago_fecha := OLD.fecha::DATE;
  ELSE
    pago_fecha := NEW.fecha::DATE;
  END IF;

  -- Crear caja si no existe
  INSERT INTO clinic.cajas (fecha)
  VALUES (pago_fecha)
  ON CONFLICT (fecha) DO NOTHING;

  -- Recalcular totales
  UPDATE clinic.cajas
  SET
    total_efectivo = COALESCE((
      SELECT SUM(monto) FROM clinic.pagos
      WHERE fecha::DATE = pago_fecha
        AND metodo_pago = 'efectivo'
        AND estado = 'activo'
    ), 0),
    total_tarjeta = COALESCE((
      SELECT SUM(monto) FROM clinic.pagos
      WHERE fecha::DATE = pago_fecha
        AND metodo_pago = 'tarjeta'
        AND estado = 'activo'
    ), 0),
    total_transferencia = COALESCE((
      SELECT SUM(monto) FROM clinic.pagos
      WHERE fecha::DATE = pago_fecha
        AND metodo_pago = 'transferencia'
        AND estado = 'activo'
    ), 0),
    total_anulaciones = COALESCE((
      SELECT SUM(monto) FROM clinic.pagos
      WHERE fecha::DATE = pago_fecha
        AND estado = 'anulado'
    ), 0),
    updated_at = NOW()
  WHERE fecha = pago_fecha;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_totales_caja
  AFTER INSERT OR UPDATE OR DELETE ON clinic.pagos
  FOR EACH ROW
  EXECUTE FUNCTION clinic.actualizar_totales_caja();
```

### Trigger: Bloquear Caja Cerrada

```sql
CREATE OR REPLACE FUNCTION clinic.bloquear_pagos_caja_cerrada()
RETURNS TRIGGER AS $$
DECLARE
  caja_estado VARCHAR(20);
BEGIN
  SELECT estado INTO caja_estado
  FROM clinic.cajas
  WHERE fecha = NEW.fecha::DATE;

  IF caja_estado = 'cerrada' THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en una caja cerrada. La caja del % está cerrada.',
      NEW.fecha::DATE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bloquear_pagos_caja_cerrada
  BEFORE INSERT ON clinic.pagos
  FOR EACH ROW
  EXECUTE FUNCTION clinic.bloquear_pagos_caja_cerrada();
```

## Vista: Resumen de Caja

```sql
CREATE OR REPLACE VIEW clinic.v_resumen_caja AS
SELECT
  c.id,
  c.fecha,
  c.estado,
  c.base_inicial,

  -- Totales por método
  c.total_efectivo,
  c.total_tarjeta,
  c.total_transferencia,
  c.total_anulaciones,

  -- Total general
  (c.total_efectivo + c.total_tarjeta + c.total_transferencia) AS total_ingresos,

  -- Efectivo esperado en caja
  (c.base_inicial + c.total_efectivo) AS efectivo_esperado,

  -- Información de cierre
  c.efectivo_contado,
  c.diferencia,
  c.justificacion_diferencia,

  -- Conteos
  (SELECT COUNT(*) FROM clinic.pagos p WHERE p.fecha::DATE = c.fecha AND p.estado = 'activo') AS num_pagos,
  (SELECT COUNT(*) FROM clinic.pagos p WHERE p.fecha::DATE = c.fecha AND p.estado = 'anulado') AS num_anulaciones,

  -- Responsables
  ua.nombre_completo AS apertura_responsable,
  uc.nombre_completo AS cierre_responsable,
  c.apertura_hora,
  c.cierre_hora

FROM clinic.cajas c
LEFT JOIN clinic.usuarios ua ON ua.id = c.apertura_por
LEFT JOIN clinic.usuarios uc ON uc.id = c.cierre_por;
```

## Server Actions

### actions/caja.ts

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function abrirCaja(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const fecha = formData.get('fecha') as string
  const baseInicial = parseFloat(formData.get('base_inicial') as string)
  const fotoUrl = formData.get('foto_url') as string | null

  // Verificar que no exista caja abierta
  const { data: cajaExistente } = await supabase
    .from('cajas')
    .select('id, estado')
    .eq('fecha', fecha)
    .single()

  if (cajaExistente && cajaExistente.estado !== 'cerrada') {
    return { error: 'Ya existe una caja abierta para esta fecha' }
  }

  const { data, error } = await supabase
    .from('cajas')
    .upsert({
      fecha,
      base_inicial: baseInicial,
      apertura_foto_url: fotoUrl,
      apertura_hora: new Date().toISOString(),
      apertura_por: user.id,
      estado: 'abierta',
    })
    .select()
    .single()

  if (error) throw error

  revalidatePath('/caja')
  return { data }
}

export async function obtenerCajaDelDia(fecha?: string) {
  const supabase = await createClient()

  const fechaQuery = fecha || new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('v_resumen_caja')
    .select('*')
    .eq('fecha', fechaQuery)
    .single()

  // Si no existe, crear una vacía
  if (!data) {
    return {
      fecha: fechaQuery,
      estado: 'sin_abrir',
      base_inicial: 0,
      total_efectivo: 0,
      total_tarjeta: 0,
      total_transferencia: 0,
      total_anulaciones: 0,
      total_ingresos: 0,
      efectivo_esperado: 0,
      num_pagos: 0,
      num_anulaciones: 0,
    }
  }

  return data
}

export async function obtenerPagosDelDia(fecha?: string) {
  const supabase = await createClient()

  const fechaQuery = fecha || new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('pagos')
    .select(`
      *,
      paciente:pacientes(id, nombre_completo),
      registrado_por:usuarios(id, nombre_completo)
    `)
    .gte('fecha', `${fechaQuery}T00:00:00`)
    .lt('fecha', `${fechaQuery}T23:59:59`)
    .order('fecha', { ascending: false })

  if (error) throw error
  return data
}

export async function iniciarCierre(cajaId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data, error } = await supabase
    .from('cajas')
    .update({
      estado: 'en_cierre',
      updated_at: new Date().toISOString(),
    })
    .eq('id', cajaId)
    .eq('estado', 'abierta') // Solo si está abierta
    .select()
    .single()

  if (error) throw error
  if (!data) return { error: 'La caja no está disponible para cierre' }

  revalidatePath('/caja')
  return { data }
}

export async function finalizarCierre(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const cajaId = formData.get('caja_id') as string
  const efectivoContado = parseFloat(formData.get('efectivo_contado') as string)
  const justificacion = formData.get('justificacion') as string | null
  const fotoUrl = formData.get('foto_url') as string

  // Obtener caja actual
  const { data: caja } = await supabase
    .from('cajas')
    .select('base_inicial, total_efectivo')
    .eq('id', cajaId)
    .single()

  if (!caja) return { error: 'Caja no encontrada' }

  const efectivoEsperado = caja.base_inicial + caja.total_efectivo
  const diferencia = efectivoContado - efectivoEsperado

  // Si hay diferencia significativa, requerir justificación
  if (Math.abs(diferencia) > 10000 && !justificacion) {
    return {
      error: 'Se requiere justificación para diferencias mayores a $10,000',
      diferencia,
      efectivoEsperado,
    }
  }

  const { data, error } = await supabase
    .from('cajas')
    .update({
      efectivo_contado: efectivoContado,
      diferencia,
      justificacion_diferencia: justificacion,
      cierre_foto_url: fotoUrl,
      cierre_hora: new Date().toISOString(),
      cierre_por: user.id,
      estado: 'cerrada',
      updated_at: new Date().toISOString(),
    })
    .eq('id', cajaId)
    .eq('estado', 'en_cierre') // Solo si está en proceso de cierre
    .select()
    .single()

  if (error) throw error
  if (!data) return { error: 'No se pudo completar el cierre' }

  // Registrar en auditoría
  await supabase.from('audit.log').insert({
    tabla: 'cajas',
    registro_id: cajaId,
    accion: 'CIERRE',
    datos_nuevos: {
      efectivo_contado: efectivoContado,
      diferencia,
      justificacion: justificacion,
    },
    usuario_id: user.id,
    ip_address: null, // Se obtiene del middleware
  })

  revalidatePath('/caja')
  return { data }
}

export async function generarReporteCaja(fecha: string) {
  const supabase = await createClient()

  const [cajaData, pagosData] = await Promise.all([
    obtenerCajaDelDia(fecha),
    obtenerPagosDelDia(fecha),
  ])

  // Agrupar pagos por concepto
  const pagosPorConcepto = pagosData?.reduce((acc: any, pago: any) => {
    const concepto = pago.concepto
    if (!acc[concepto]) {
      acc[concepto] = { cantidad: 0, total: 0 }
    }
    acc[concepto].cantidad++
    acc[concepto].total += pago.monto
    return acc
  }, {})

  return {
    caja: cajaData,
    pagos: pagosData,
    resumenPorConcepto: pagosPorConcepto,
    totalPagos: pagosData?.length || 0,
    totalIngresos: cajaData?.total_ingresos || 0,
  }
}
```

## Componentes UI

### Panel de Caja del Día

```tsx
// components/caja/panel-caja.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  DollarSign, CreditCard, Smartphone,
  AlertTriangle, CheckCircle, Lock
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { obtenerCajaDelDia } from '@/actions/caja'

function formatMoney(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function PanelCaja() {
  const hoy = format(new Date(), 'yyyy-MM-dd')

  const { data: caja, isLoading } = useQuery({
    queryKey: ['caja', hoy],
    queryFn: () => obtenerCajaDelDia(hoy),
    refetchInterval: 30000, // Actualizar cada 30 segundos
  })

  if (isLoading) {
    return <div>Cargando...</div>
  }

  const estadoBadge = {
    sin_abrir: { color: 'bg-gray-100 text-gray-800', texto: 'Sin abrir' },
    abierta: { color: 'bg-green-100 text-green-800', texto: 'Abierta' },
    en_cierre: { color: 'bg-yellow-100 text-yellow-800', texto: 'En cierre' },
    cerrada: { color: 'bg-blue-100 text-blue-800', texto: 'Cerrada' },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Caja del Día</h1>
          <p className="text-muted-foreground">
            {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
          </p>
        </div>
        <Badge className={estadoBadge[caja?.estado as keyof typeof estadoBadge]?.color}>
          {estadoBadge[caja?.estado as keyof typeof estadoBadge]?.texto}
        </Badge>
      </div>

      {/* Totales por método */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Efectivo</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatMoney(caja?.total_efectivo || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Base inicial: {formatMoney(caja?.base_inicial || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tarjeta</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatMoney(caja?.total_tarjeta || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Transferencia</CardTitle>
            <Smartphone className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatMoney(caja?.total_transferencia || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumen total */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Ingresos del Día</p>
              <p className="text-3xl font-bold">
                {formatMoney(caja?.total_ingresos || 0)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Pagos registrados</p>
              <p className="text-2xl font-semibold">{caja?.num_pagos || 0}</p>
            </div>
          </div>

          {/* Anulaciones si las hay */}
          {(caja?.num_anulaciones || 0) > 0 && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-800">
                {caja?.num_anulaciones} anulaciones por {formatMoney(caja?.total_anulaciones || 0)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acciones según estado */}
      <div className="flex gap-4">
        {caja?.estado === 'sin_abrir' && (
          <Button size="lg" className="flex-1">
            Abrir Caja del Día
          </Button>
        )}

        {caja?.estado === 'abierta' && (
          <>
            <Button size="lg" className="flex-1">
              Registrar Pago
            </Button>
            <Button size="lg" variant="outline">
              Iniciar Cierre
            </Button>
          </>
        )}

        {caja?.estado === 'en_cierre' && (
          <Button size="lg" className="flex-1">
            <Lock className="h-4 w-4 mr-2" />
            Completar Cierre
          </Button>
        )}

        {caja?.estado === 'cerrada' && (
          <div className="flex-1 p-4 bg-green-50 rounded-lg flex items-center justify-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-green-800 font-medium">
              Caja cerrada a las {caja?.cierre_hora ? format(new Date(caja.cierre_hora), 'HH:mm') : '--:--'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
```

### Formulario de Cierre

```tsx
// components/caja/formulario-cierre.tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Camera, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CapturaFoto } from '@/components/shared/captura-foto'
import { finalizarCierre } from '@/actions/caja'

const cierreSchema = z.object({
  efectivo_contado: z.number().min(0, 'Debe ser mayor o igual a 0'),
  justificacion: z.string().optional(),
})

interface Props {
  cajaId: string
  efectivoEsperado: number
  onComplete: () => void
}

export function FormularioCierre({ cajaId, efectivoEsperado, onComplete }: Props) {
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [mostrarJustificacion, setMostrarJustificacion] = useState(false)
  const [diferencia, setDiferencia] = useState(0)

  const form = useForm({
    resolver: zodResolver(cierreSchema),
    defaultValues: {
      efectivo_contado: efectivoEsperado,
      justificacion: '',
    },
  })

  const efectivoContado = form.watch('efectivo_contado')

  // Calcular diferencia cuando cambia el efectivo contado
  const calcularDiferencia = (contado: number) => {
    const diff = contado - efectivoEsperado
    setDiferencia(diff)
    setMostrarJustificacion(Math.abs(diff) > 10000)
  }

  const onSubmit = async (data: z.infer<typeof cierreSchema>) => {
    if (!fotoUrl) {
      alert('Debe tomar foto del conteo de efectivo')
      return
    }

    const formData = new FormData()
    formData.set('caja_id', cajaId)
    formData.set('efectivo_contado', data.efectivo_contado.toString())
    formData.set('justificacion', data.justificacion || '')
    formData.set('foto_url', fotoUrl)

    const result = await finalizarCierre(formData)

    if (result.error) {
      alert(result.error)
      return
    }

    onComplete()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cierre de Caja</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Efectivo esperado */}
          <Alert>
            <AlertDescription className="flex justify-between items-center">
              <span>Efectivo esperado en caja:</span>
              <span className="text-xl font-bold">
                ${efectivoEsperado.toLocaleString('es-CO')}
              </span>
            </AlertDescription>
          </Alert>

          {/* Conteo de efectivo */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Efectivo contado físicamente
            </label>
            <Input
              type="number"
              {...form.register('efectivo_contado', { valueAsNumber: true })}
              onChange={(e) => {
                form.register('efectivo_contado').onChange(e)
                calcularDiferencia(parseFloat(e.target.value) || 0)
              }}
              className="text-2xl h-14"
            />
          </div>

          {/* Diferencia */}
          {diferencia !== 0 && (
            <Alert variant={diferencia > 0 ? 'default' : 'destructive'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Diferencia: {diferencia > 0 ? '+' : ''}
                ${diferencia.toLocaleString('es-CO')}
                {diferencia > 0 ? ' (sobrante)' : ' (faltante)'}
              </AlertDescription>
            </Alert>
          )}

          {/* Justificación (si hay diferencia significativa) */}
          {mostrarJustificacion && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-red-600">
                Justificación de diferencia (obligatoria)
              </label>
              <Textarea
                {...form.register('justificacion')}
                placeholder="Explique la razón de la diferencia..."
                rows={3}
              />
            </div>
          )}

          {/* Foto del conteo */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Foto del conteo de efectivo (obligatoria)
            </label>
            <CapturaFoto
              onCapture={setFotoUrl}
              capturedUrl={fotoUrl}
            />
          </div>

          {/* Botón de cierre */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!fotoUrl || (mostrarJustificacion && !form.watch('justificacion'))}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Confirmar Cierre de Caja
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

### Lista de Pagos del Día

```tsx
// components/caja/lista-pagos-dia.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Eye, Ban, DollarSign, CreditCard, Smartphone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { obtenerPagosDelDia } from '@/actions/caja'

const ICONOS_METODO = {
  efectivo: DollarSign,
  tarjeta: CreditCard,
  transferencia: Smartphone,
}

interface Props {
  fecha: string
}

export function ListaPagosDia({ fecha }: Props) {
  const { data: pagos, isLoading } = useQuery({
    queryKey: ['pagos-dia', fecha],
    queryFn: () => obtenerPagosDelDia(fecha),
  })

  if (isLoading) return <div>Cargando...</div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagos del Día ({pagos?.length || 0})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora</TableHead>
              <TableHead>Recibo</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagos?.map((pago: any) => {
              const IconoMetodo = ICONOS_METODO[pago.metodo_pago as keyof typeof ICONOS_METODO]
              return (
                <TableRow
                  key={pago.id}
                  className={pago.estado === 'anulado' ? 'opacity-50' : ''}
                >
                  <TableCell>
                    {format(new Date(pago.fecha), 'HH:mm')}
                  </TableCell>
                  <TableCell className="font-mono">
                    {pago.numero_recibo}
                  </TableCell>
                  <TableCell>
                    {pago.paciente?.nombre_completo}
                  </TableCell>
                  <TableCell>{pago.concepto}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <IconoMetodo className="h-4 w-4" />
                      <span className="capitalize">{pago.metodo_pago}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    ${pago.monto.toLocaleString('es-CO')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={pago.estado === 'activo' ? 'default' : 'destructive'}>
                      {pago.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

## Reporte de Cierre (PDF)

```tsx
// components/caja/reporte-cierre-pdf.tsx
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
  },
  header: {
    marginBottom: 20,
    borderBottom: 1,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
    padding: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  total: {
    fontWeight: 'bold',
    borderTop: 1,
    paddingTop: 5,
    marginTop: 5,
  },
  firma: {
    marginTop: 40,
    borderTop: 1,
    paddingTop: 10,
    textAlign: 'center',
  },
})

interface Props {
  data: {
    fecha: string
    caja: any
    pagos: any[]
    resumenPorConcepto: any
  }
}

export function ReporteCierrePDF({ data }: Props) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>VarixCenter</Text>
          <Text>Centro Médico Flebológico</Text>
          <Text>Cierre de Caja - {data.fecha}</Text>
        </View>

        {/* Resumen por método de pago */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen por Método de Pago</Text>
          <View style={styles.row}>
            <Text>Efectivo:</Text>
            <Text>${data.caja.total_efectivo.toLocaleString()}</Text>
          </View>
          <View style={styles.row}>
            <Text>Tarjeta:</Text>
            <Text>${data.caja.total_tarjeta.toLocaleString()}</Text>
          </View>
          <View style={styles.row}>
            <Text>Transferencia:</Text>
            <Text>${data.caja.total_transferencia.toLocaleString()}</Text>
          </View>
          <View style={[styles.row, styles.total]}>
            <Text>TOTAL INGRESOS:</Text>
            <Text>${data.caja.total_ingresos.toLocaleString()}</Text>
          </View>
        </View>

        {/* Cuadre de efectivo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuadre de Efectivo</Text>
          <View style={styles.row}>
            <Text>Base inicial:</Text>
            <Text>${data.caja.base_inicial.toLocaleString()}</Text>
          </View>
          <View style={styles.row}>
            <Text>+ Efectivo recibido:</Text>
            <Text>${data.caja.total_efectivo.toLocaleString()}</Text>
          </View>
          <View style={[styles.row, styles.total]}>
            <Text>= Efectivo esperado:</Text>
            <Text>${data.caja.efectivo_esperado.toLocaleString()}</Text>
          </View>
          <View style={styles.row}>
            <Text>Efectivo contado:</Text>
            <Text>${data.caja.efectivo_contado.toLocaleString()}</Text>
          </View>
          <View style={[styles.row, { color: data.caja.diferencia < 0 ? 'red' : 'green' }]}>
            <Text>Diferencia:</Text>
            <Text>${data.caja.diferencia.toLocaleString()}</Text>
          </View>
          {data.caja.justificacion_diferencia && (
            <View style={{ marginTop: 5 }}>
              <Text>Justificación: {data.caja.justificacion_diferencia}</Text>
            </View>
          )}
        </View>

        {/* Resumen por concepto */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Desglose por Concepto</Text>
          {Object.entries(data.resumenPorConcepto).map(([concepto, info]: [string, any]) => (
            <View key={concepto} style={styles.row}>
              <Text>{concepto} ({info.cantidad}):</Text>
              <Text>${info.total.toLocaleString()}</Text>
            </View>
          ))}
        </View>

        {/* Anulaciones si las hay */}
        {data.caja.num_anulaciones > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { backgroundColor: '#ffeeee' }]}>
              Anulaciones ({data.caja.num_anulaciones})
            </Text>
            <View style={styles.row}>
              <Text>Total anulado:</Text>
              <Text>${data.caja.total_anulaciones.toLocaleString()}</Text>
            </View>
          </View>
        )}

        {/* Firma */}
        <View style={styles.firma}>
          <Text>_______________________________</Text>
          <Text>{data.caja.cierre_responsable}</Text>
          <Text>Responsable de Cierre</Text>
          <Text>Hora: {data.caja.cierre_hora}</Text>
        </View>
      </Page>
    </Document>
  )
}
```

## Prompt para v0.dev

```
Crear un dashboard de cierre de caja para tablet con las siguientes características:

Layout principal:
- Header con fecha actual y estado de caja (badge de color)
- 3 cards con totales: Efectivo (verde), Tarjeta (azul), Transferencia (púrpura)
- Card grande con total del día y número de transacciones
- Alerta si hay anulaciones

Estados de caja:
- Sin abrir: botón "Abrir Caja"
- Abierta: botones "Registrar Pago" y "Iniciar Cierre"
- En cierre: formulario de conteo
- Cerrada: mensaje de confirmación con hora

Formulario de cierre:
- Mostrar efectivo esperado
- Input para efectivo contado (grande, fácil de usar)
- Mostrar diferencia en tiempo real (verde si positivo, rojo si negativo)
- Textarea para justificación si diferencia > $10,000
- Botón para tomar foto del conteo
- Botón de confirmar cierre

Lista de pagos del día:
- Tabla con: hora, número recibo, paciente, concepto, método (con icono), monto
- Badge de estado (activo/anulado)
- Anulados en gris tachado

Stack: React, TypeScript, shadcn/ui, Tailwind CSS
Tema: Profesional, limpio, fácil de leer
```

## Seguridad

### Permisos por Rol

| Acción | Secretaria | Médico | Admin |
|--------|------------|--------|-------|
| Ver caja del día | X | | X |
| Abrir caja | X | | X |
| Registrar pagos | X | | X |
| Iniciar cierre | X | | X |
| Completar cierre | X | | X |
| Ver cierres anteriores | | | X |
| Anular pagos | | | X |
| Modificar cierre | | | X |

---

## Próximo: [06_INTEGRACION_MEDIAS.md](./06_INTEGRACION_MEDIAS.md)
