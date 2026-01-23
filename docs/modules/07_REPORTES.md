# Módulo 07: Reportes y Analíticas

## Descripción General

Sistema de reportes y dashboards que permiten a la administración visualizar métricas clave del negocio: ingresos, productividad de médicos, procedimientos realizados, y detección de anomalías que podrían indicar irregularidades.

## Tipos de Reportes

```
┌─────────────────────────────────────────────────────────────────┐
│                    CATEGORÍAS DE REPORTES                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FINANCIEROS                      OPERATIVOS                    │
│  ────────────                     ──────────                    │
│  • Ingresos diarios/mensuales     • Citas por médico            │
│  • Comparativo períodos           • Procedimientos realizados   │
│  • Por método de pago             • Tasa de no-show             │
│  • Por concepto/servicio          • Tiempo promedio consulta    │
│                                                                 │
│  PACIENTES                        SEGURIDAD                     │
│  ─────────                        ─────────                     │
│  • Nuevos vs recurrentes          • Anulaciones por usuario     │
│  • Tratamientos activos           • Modificaciones inusuales    │
│  • Retención/abandono             • Accesos fuera de horario    │
│  • Medias pendientes              • Diferencias de caja         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Modelo de Datos

### Vistas Materializadas para Reportes

```sql
-- Vista: Resumen financiero diario
CREATE MATERIALIZED VIEW clinic.mv_resumen_financiero_diario AS
SELECT
  DATE(p.fecha) AS fecha,
  COUNT(*) AS total_pagos,
  COUNT(*) FILTER (WHERE p.estado = 'anulado') AS pagos_anulados,
  SUM(p.monto) FILTER (WHERE p.estado = 'activo') AS ingresos_totales,
  SUM(p.monto) FILTER (WHERE p.estado = 'activo' AND p.metodo_pago = 'efectivo') AS efectivo,
  SUM(p.monto) FILTER (WHERE p.estado = 'activo' AND p.metodo_pago = 'tarjeta') AS tarjeta,
  SUM(p.monto) FILTER (WHERE p.estado = 'activo' AND p.metodo_pago = 'transferencia') AS transferencia,
  SUM(p.monto) FILTER (WHERE p.estado = 'anulado') AS monto_anulado
FROM clinic.pagos p
GROUP BY DATE(p.fecha)
ORDER BY fecha DESC;

-- Refrescar diariamente
CREATE INDEX idx_mv_resumen_financiero_fecha ON clinic.mv_resumen_financiero_diario(fecha);

-- Vista: Productividad por médico
CREATE MATERIALIZED VIEW clinic.mv_productividad_medico AS
SELECT
  u.id AS medico_id,
  u.nombre_completo AS medico,
  DATE_TRUNC('month', c.fecha) AS mes,
  COUNT(*) AS total_citas,
  COUNT(*) FILTER (WHERE c.estado = 'completada') AS citas_completadas,
  COUNT(*) FILTER (WHERE c.estado = 'no_asistio') AS no_shows,
  COUNT(*) FILTER (WHERE c.tipo_cita = 'valoracion') AS valoraciones,
  COUNT(*) FILTER (WHERE c.tipo_cita = 'escleroterapia') AS escleroterapias,
  COUNT(*) FILTER (WHERE c.tipo_cita = 'ecor') AS ecors,
  ROUND(
    COUNT(*) FILTER (WHERE c.estado = 'no_asistio')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS tasa_no_show
FROM clinic.usuarios u
LEFT JOIN clinic.citas c ON c.medico_id = u.id
WHERE u.rol = 'medico'
GROUP BY u.id, u.nombre_completo, DATE_TRUNC('month', c.fecha);

-- Vista: Ingresos por servicio
CREATE MATERIALIZED VIEW clinic.mv_ingresos_por_servicio AS
SELECT
  DATE_TRUNC('month', p.fecha) AS mes,
  p.concepto,
  COUNT(*) AS cantidad,
  SUM(p.monto) AS ingresos,
  AVG(p.monto) AS promedio
FROM clinic.pagos p
WHERE p.estado = 'activo'
GROUP BY DATE_TRUNC('month', p.fecha), p.concepto
ORDER BY mes DESC, ingresos DESC;

-- Función para refrescar vistas materializadas
CREATE OR REPLACE FUNCTION clinic.refrescar_vistas_reportes()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY clinic.mv_resumen_financiero_diario;
  REFRESH MATERIALIZED VIEW CONCURRENTLY clinic.mv_productividad_medico;
  REFRESH MATERIALIZED VIEW CONCURRENTLY clinic.mv_ingresos_por_servicio;
END;
$$ LANGUAGE plpgsql;
```

### Vista: Alertas de Seguridad

```sql
CREATE VIEW clinic.v_alertas_seguridad AS
-- Anulaciones frecuentes
SELECT
  'anulacion_frecuente' AS tipo_alerta,
  u.id AS usuario_id,
  u.nombre_completo AS usuario,
  COUNT(*) AS cantidad,
  'Usuario con muchas anulaciones este mes' AS descripcion,
  MAX(p.updated_at) AS ultima_ocurrencia
FROM clinic.pagos p
JOIN clinic.usuarios u ON u.id = p.anulado_por
WHERE p.estado = 'anulado'
  AND p.updated_at > DATE_TRUNC('month', CURRENT_DATE)
GROUP BY u.id, u.nombre_completo
HAVING COUNT(*) > 5

UNION ALL

-- Diferencias de caja significativas
SELECT
  'diferencia_caja' AS tipo_alerta,
  c.cierre_por AS usuario_id,
  u.nombre_completo AS usuario,
  ABS(c.diferencia)::INTEGER AS cantidad,
  'Diferencia significativa en cierre de caja' AS descripcion,
  c.cierre_hora AS ultima_ocurrencia
FROM clinic.cajas c
JOIN clinic.usuarios u ON u.id = c.cierre_por
WHERE c.estado = 'cerrada'
  AND ABS(c.diferencia) > 50000
  AND c.fecha > CURRENT_DATE - INTERVAL '30 days'

UNION ALL

-- Accesos fuera de horario
SELECT
  'acceso_fuera_horario' AS tipo_alerta,
  al.usuario_id,
  u.nombre_completo AS usuario,
  COUNT(*) AS cantidad,
  'Accesos fuera del horario laboral' AS descripcion,
  MAX(al.created_at) AS ultima_ocurrencia
FROM audit.log al
JOIN clinic.usuarios u ON u.id = al.usuario_id
WHERE EXTRACT(HOUR FROM al.created_at) NOT BETWEEN 7 AND 20
  AND al.created_at > CURRENT_DATE - INTERVAL '7 days'
GROUP BY al.usuario_id, u.nombre_completo
HAVING COUNT(*) > 3;
```

## Server Actions

### actions/reportes.ts

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'

// Reporte: Dashboard principal
export async function obtenerDashboardPrincipal() {
  const supabase = await createClient()

  const hoy = new Date()
  const inicioMes = startOfMonth(hoy)
  const finMes = endOfMonth(hoy)
  const inicioMesAnterior = startOfMonth(subMonths(hoy, 1))
  const finMesAnterior = endOfMonth(subMonths(hoy, 1))

  // Ejecutar consultas en paralelo
  const [
    { data: ingresosHoy },
    { data: ingresosMes },
    { data: ingresosMesAnterior },
    { data: citasHoy },
    { data: pacientesNuevosMes },
    { data: alertas },
  ] = await Promise.all([
    // Ingresos de hoy
    supabase
      .from('pagos')
      .select('monto')
      .eq('estado', 'activo')
      .gte('fecha', format(hoy, 'yyyy-MM-dd'))
      .lt('fecha', format(hoy, 'yyyy-MM-dd') + 'T23:59:59'),

    // Ingresos del mes actual
    supabase
      .from('pagos')
      .select('monto')
      .eq('estado', 'activo')
      .gte('fecha', inicioMes.toISOString())
      .lte('fecha', finMes.toISOString()),

    // Ingresos del mes anterior (para comparación)
    supabase
      .from('pagos')
      .select('monto')
      .eq('estado', 'activo')
      .gte('fecha', inicioMesAnterior.toISOString())
      .lte('fecha', finMesAnterior.toISOString()),

    // Citas de hoy
    supabase
      .from('citas')
      .select('id, estado')
      .eq('fecha', format(hoy, 'yyyy-MM-dd')),

    // Pacientes nuevos este mes
    supabase
      .from('pacientes')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', inicioMes.toISOString()),

    // Alertas de seguridad
    supabase.from('v_alertas_seguridad').select('*'),
  ])

  const totalHoy = ingresosHoy?.reduce((acc, p) => acc + p.monto, 0) || 0
  const totalMes = ingresosMes?.reduce((acc, p) => acc + p.monto, 0) || 0
  const totalMesAnterior = ingresosMesAnterior?.reduce((acc, p) => acc + p.monto, 0) || 0

  return {
    financiero: {
      ingresosHoy: totalHoy,
      ingresosMes: totalMes,
      variacionMensual: totalMesAnterior > 0
        ? ((totalMes - totalMesAnterior) / totalMesAnterior * 100).toFixed(1)
        : 0,
    },
    citas: {
      total: citasHoy?.length || 0,
      completadas: citasHoy?.filter(c => c.estado === 'completada').length || 0,
      pendientes: citasHoy?.filter(c => ['programada', 'confirmada'].includes(c.estado)).length || 0,
      enAtencion: citasHoy?.filter(c => c.estado === 'en_atencion').length || 0,
    },
    pacientesNuevosMes: pacientesNuevosMes,
    alertasSeguridad: alertas?.length || 0,
  }
}

// Reporte: Ingresos por período
export async function obtenerReporteIngresos(
  fechaInicio: string,
  fechaFin: string,
  agrupacion: 'dia' | 'semana' | 'mes' = 'dia'
) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('mv_resumen_financiero_diario')
    .select('*')
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin)
    .order('fecha')

  if (error) throw error

  // Agrupar según el período solicitado
  if (agrupacion === 'dia') {
    return data
  }

  // Para semana o mes, necesitamos agrupar
  const agrupado = data?.reduce((acc: any, row: any) => {
    const key = agrupacion === 'semana'
      ? format(new Date(row.fecha), 'yyyy-ww')
      : format(new Date(row.fecha), 'yyyy-MM')

    if (!acc[key]) {
      acc[key] = {
        periodo: key,
        ingresos_totales: 0,
        efectivo: 0,
        tarjeta: 0,
        transferencia: 0,
        total_pagos: 0,
        pagos_anulados: 0,
      }
    }

    acc[key].ingresos_totales += row.ingresos_totales || 0
    acc[key].efectivo += row.efectivo || 0
    acc[key].tarjeta += row.tarjeta || 0
    acc[key].transferencia += row.transferencia || 0
    acc[key].total_pagos += row.total_pagos || 0
    acc[key].pagos_anulados += row.pagos_anulados || 0

    return acc
  }, {})

  return Object.values(agrupado)
}

// Reporte: Productividad por médico
export async function obtenerReporteProductividad(mes?: string) {
  const supabase = await createClient()

  const mesQuery = mes || format(new Date(), 'yyyy-MM')

  const { data, error } = await supabase
    .from('mv_productividad_medico')
    .select('*')
    .eq('mes', `${mesQuery}-01`)
    .order('citas_completadas', { ascending: false })

  if (error) throw error
  return data
}

// Reporte: Servicios más solicitados
export async function obtenerReporteServicios(
  fechaInicio: string,
  fechaFin: string
) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('pagos')
    .select('concepto, monto')
    .eq('estado', 'activo')
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin)

  if (error) throw error

  // Agrupar por concepto
  const porConcepto = data?.reduce((acc: any, pago: any) => {
    if (!acc[pago.concepto]) {
      acc[pago.concepto] = { concepto: pago.concepto, cantidad: 0, ingresos: 0 }
    }
    acc[pago.concepto].cantidad++
    acc[pago.concepto].ingresos += pago.monto
    return acc
  }, {})

  return Object.values(porConcepto)
    .sort((a: any, b: any) => b.ingresos - a.ingresos)
}

// Reporte: Alertas de seguridad detalladas
export async function obtenerAlertasSeguridad() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  // Verificar rol de admin
  const { data: perfil } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (perfil?.rol !== 'admin') {
    throw new Error('Solo administradores pueden ver alertas de seguridad')
  }

  const { data, error } = await supabase
    .from('v_alertas_seguridad')
    .select('*')
    .order('ultima_ocurrencia', { ascending: false })

  if (error) throw error
  return data
}

// Reporte: Pacientes con tratamiento activo
export async function obtenerPacientesTratamientoActivo() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('historias_clinicas')
    .select(`
      id,
      paciente:pacientes(id, nombre_completo, telefono),
      fecha_inicio_tratamiento,
      sesiones_escleroterapia_completadas,
      sesiones_escleroterapia_requeridas,
      ecor_completado,
      ecor_requerido
    `)
    .eq('estado', 'en_tratamiento')
    .order('fecha_inicio_tratamiento', { ascending: false })

  if (error) throw error

  return data?.map(h => ({
    ...h,
    progreso_escleroterapia: h.sesiones_escleroterapia_requeridas > 0
      ? (h.sesiones_escleroterapia_completadas / h.sesiones_escleroterapia_requeridas * 100).toFixed(0)
      : 100,
    progreso_ecor: h.ecor_requerido
      ? (h.ecor_completado ? 100 : 0)
      : 100,
  }))
}
```

## Componentes UI

### Dashboard Principal

```tsx
// components/reportes/dashboard-principal.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import {
  DollarSign, Users, Calendar, AlertTriangle,
  TrendingUp, TrendingDown
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { obtenerDashboardPrincipal } from '@/actions/reportes'

function formatMoney(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function DashboardPrincipal() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: obtenerDashboardPrincipal,
    refetchInterval: 60000, // Actualizar cada minuto
  })

  if (isLoading) return <div>Cargando dashboard...</div>

  const variacion = parseFloat(data?.financiero.variacionMensual || '0')

  return (
    <div className="space-y-6">
      {/* Alertas de seguridad */}
      {(data?.alertasSeguridad || 0) > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-800 font-medium">
              Hay {data?.alertasSeguridad} alerta(s) de seguridad pendientes
            </span>
            <Badge variant="destructive" className="ml-auto">
              Ver alertas
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Ingresos del día */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Hoy</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMoney(data?.financiero.ingresosHoy || 0)}
            </div>
          </CardContent>
        </Card>

        {/* Ingresos del mes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Mes</CardTitle>
            {variacion >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMoney(data?.financiero.ingresosMes || 0)}
            </div>
            <p className={`text-xs ${variacion >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {variacion >= 0 ? '+' : ''}{variacion}% vs mes anterior
            </p>
          </CardContent>
        </Card>

        {/* Citas del día */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Citas Hoy</CardTitle>
            <Calendar className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.citas.total}</div>
            <p className="text-xs text-muted-foreground">
              {data?.citas.completadas} completadas • {data?.citas.pendientes} pendientes
            </p>
          </CardContent>
        </Card>

        {/* Pacientes nuevos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pacientes Nuevos</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.pacientesNuevosMes}</div>
            <p className="text-xs text-muted-foreground">Este mes</p>
          </CardContent>
        </Card>
      </div>

      {/* Más widgets irían aquí */}
    </div>
  )
}
```

### Gráfico de Ingresos

```tsx
// components/reportes/grafico-ingresos.tsx
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays, subMonths } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { obtenerReporteIngresos } from '@/actions/reportes'

const PERIODOS = [
  { value: '7d', label: 'Últimos 7 días', dias: 7, agrupacion: 'dia' },
  { value: '30d', label: 'Últimos 30 días', dias: 30, agrupacion: 'dia' },
  { value: '3m', label: 'Últimos 3 meses', meses: 3, agrupacion: 'semana' },
  { value: '12m', label: 'Último año', meses: 12, agrupacion: 'mes' },
]

export function GraficoIngresos() {
  const [periodo, setPeriodo] = useState('30d')

  const config = PERIODOS.find(p => p.value === periodo)!
  const fechaFin = new Date()
  const fechaInicio = config.dias
    ? subDays(fechaFin, config.dias)
    : subMonths(fechaFin, config.meses!)

  const { data, isLoading } = useQuery({
    queryKey: ['reporte-ingresos', periodo],
    queryFn: () => obtenerReporteIngresos(
      format(fechaInicio, 'yyyy-MM-dd'),
      format(fechaFin, 'yyyy-MM-dd'),
      config.agrupacion as 'dia' | 'semana' | 'mes'
    ),
  })

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      notation: 'compact',
      compactDisplay: 'short',
    }).format(value)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Ingresos</CardTitle>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS.map(p => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              Cargando...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={config.agrupacion === 'dia' ? 'fecha' : 'periodo'}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={formatMoney}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number) =>
                    new Intl.NumberFormat('es-CO', {
                      style: 'currency',
                      currency: 'COP',
                    }).format(value)
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="efectivo"
                  stroke="#22c55e"
                  name="Efectivo"
                />
                <Line
                  type="monotone"
                  dataKey="tarjeta"
                  stroke="#3b82f6"
                  name="Tarjeta"
                />
                <Line
                  type="monotone"
                  dataKey="transferencia"
                  stroke="#a855f7"
                  name="Transferencia"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

### Tabla de Productividad

```tsx
// components/reportes/tabla-productividad.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { obtenerReporteProductividad } from '@/actions/reportes'

export function TablaProductividad() {
  const mesActual = format(new Date(), 'yyyy-MM')

  const { data, isLoading } = useQuery({
    queryKey: ['productividad', mesActual],
    queryFn: () => obtenerReporteProductividad(mesActual),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Productividad por Médico - {format(new Date(), 'MMMM yyyy', { locale: es })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Médico</TableHead>
              <TableHead className="text-center">Total Citas</TableHead>
              <TableHead className="text-center">Completadas</TableHead>
              <TableHead className="text-center">No-Shows</TableHead>
              <TableHead className="text-center">Tasa No-Show</TableHead>
              <TableHead className="text-center">Valoraciones</TableHead>
              <TableHead className="text-center">Escleroterapias</TableHead>
              <TableHead className="text-center">ECOR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((medico: any) => (
              <TableRow key={medico.medico_id}>
                <TableCell className="font-medium">{medico.medico}</TableCell>
                <TableCell className="text-center">{medico.total_citas}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="bg-green-50">
                    {medico.citas_completadas}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {medico.no_shows > 0 && (
                    <Badge variant="destructive">{medico.no_shows}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center gap-2">
                    <Progress
                      value={medico.tasa_no_show}
                      className="w-16 h-2"
                    />
                    <span className={medico.tasa_no_show > 15 ? 'text-red-600' : ''}>
                      {medico.tasa_no_show}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-center">{medico.valoraciones}</TableCell>
                <TableCell className="text-center">{medico.escleroterapias}</TableCell>
                <TableCell className="text-center">{medico.ecors}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

### Panel de Alertas de Seguridad

```tsx
// components/reportes/alertas-seguridad.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertTriangle, Ban, Clock, DollarSign,
  Eye, Shield
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { obtenerAlertasSeguridad } from '@/actions/reportes'

const TIPO_ALERTA_CONFIG = {
  anulacion_frecuente: {
    icon: Ban,
    color: 'text-red-600 bg-red-50',
    titulo: 'Anulaciones Frecuentes',
  },
  diferencia_caja: {
    icon: DollarSign,
    color: 'text-orange-600 bg-orange-50',
    titulo: 'Diferencia de Caja',
  },
  acceso_fuera_horario: {
    icon: Clock,
    color: 'text-yellow-600 bg-yellow-50',
    titulo: 'Acceso Fuera de Horario',
  },
}

export function AlertasSeguridad() {
  const { data: alertas, isLoading } = useQuery({
    queryKey: ['alertas-seguridad'],
    queryFn: obtenerAlertasSeguridad,
  })

  if (isLoading) return <div>Cargando...</div>

  if (!alertas?.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Shield className="h-12 w-12 mx-auto text-green-500 mb-4" />
          <p className="text-lg font-medium">Sin alertas de seguridad</p>
          <p className="text-muted-foreground">
            No se han detectado actividades sospechosas
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          Alertas de Seguridad ({alertas.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {alertas.map((alerta: any, index: number) => {
          const config = TIPO_ALERTA_CONFIG[alerta.tipo_alerta as keyof typeof TIPO_ALERTA_CONFIG]
          const Icon = config?.icon || AlertTriangle

          return (
            <div
              key={index}
              className={`p-4 rounded-lg border ${config?.color || 'bg-gray-50'}`}
            >
              <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{config?.titulo}</h4>
                    <Badge variant="outline">
                      {alerta.cantidad} ocurrencias
                    </Badge>
                  </div>
                  <p className="text-sm mt-1">{alerta.descripcion}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Usuario: {alerta.usuario}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Última: {format(new Date(alerta.ultima_ocurrencia), "d 'de' MMM, HH:mm", { locale: es })}
                  </p>
                </div>
                <Button size="sm" variant="outline">
                  <Eye className="h-4 w-4 mr-1" />
                  Investigar
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
```

## Prompt para v0.dev

```
Crear un dashboard de reportes para administración de clínica médica:

Header con KPIs:
- 4 cards en fila: Ingresos Hoy, Ingresos Mes (con % variación), Citas Hoy, Pacientes Nuevos
- Cada card con icono, valor grande, y subtítulo
- Variación positiva en verde, negativa en rojo

Gráfico de ingresos:
- Line chart con 3 líneas: efectivo, tarjeta, transferencia
- Selector de período: 7 días, 30 días, 3 meses, 12 meses
- Tooltips con formato de moneda colombiana
- Colores: efectivo verde, tarjeta azul, transferencia púrpura

Tabla de productividad por médico:
- Columnas: Médico, Total Citas, Completadas, No-Shows, Tasa, Valoraciones, Escleroterapias, ECOR
- Progress bar para tasa de no-show (rojo si >15%)
- Badges de colores para cantidades

Panel de alertas de seguridad:
- Cards con fondo coloreado según tipo
- Icono, título, descripción, usuario afectado
- Badge con número de ocurrencias
- Botón "Investigar"
- Si no hay alertas, mostrar icono de escudo verde con mensaje positivo

Stack: React, TypeScript, shadcn/ui, Tailwind CSS, Recharts
```

## Permisos por Rol

| Reporte | Secretaria | Médico | Admin |
|---------|------------|--------|-------|
| Dashboard resumen | Limitado | Limitado | Completo |
| Ingresos detallados | | | X |
| Productividad médicos | | Propio | Todos |
| Servicios más solicitados | X | X | X |
| Alertas de seguridad | | | X |
| Pacientes en tratamiento | X | X | X |
| Exportar reportes | | | X |

---

## Próximo: [../database/SCHEMA.sql](../database/SCHEMA.sql)
