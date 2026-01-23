# Sistema de Auditoría y Seguridad

## Descripción General

El sistema de seguridad de VarixClinic está diseñado para prevenir y detectar fraudes internos, específicamente el robo de dinero mediante manipulación de registros. Implementa múltiples capas de protección que hacen virtualmente imposible alterar registros sin dejar rastro.

## Arquitectura de Seguridad

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CAPAS DE SEGURIDAD                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CAPA 1: AUTENTICACIÓN                                                      │
│  ─────────────────────                                                      │
│  • Supabase Auth con magic link o password                                  │
│  • Sesiones con expiración automática                                       │
│  • Vinculación usuario-dispositivo (opcional)                               │
│                                                                             │
│  CAPA 2: AUTORIZACIÓN (RLS)                                                 │
│  ──────────────────────────                                                 │
│  • Row Level Security en PostgreSQL                                         │
│  • Políticas por rol (admin, medico, secretaria)                           │
│  • Acciones críticas solo para administrador                                │
│                                                                             │
│  CAPA 3: INMUTABILIDAD                                                      │
│  ─────────────────────                                                      │
│  • Pagos: no se pueden modificar ni eliminar                                │
│  • Solo anulación con motivo obligatorio                                    │
│  • Números de recibo secuenciales nunca reutilizados                        │
│                                                                             │
│  CAPA 4: EVIDENCIA OBLIGATORIA                                              │
│  ───────────────────────────                                                │
│  • Foto obligatoria de cada pago en efectivo                                │
│  • Foto de voucher para pagos con tarjeta                                   │
│  • Captura de transferencia bancaria                                        │
│                                                                             │
│  CAPA 5: AUDITORÍA COMPLETA                                                 │
│  ──────────────────────────                                                 │
│  • Log automático de toda acción                                            │
│  • Registro de IP, usuario, timestamp                                       │
│  • Datos antes y después de cada cambio                                     │
│                                                                             │
│  CAPA 6: DETECCIÓN DE ANOMALÍAS                                             │
│  ────────────────────────────                                               │
│  • Alertas por anulaciones frecuentes                                       │
│  • Alertas por diferencias de caja                                          │
│  • Alertas por accesos fuera de horario                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Protección de Pagos

### Reglas de Inmutabilidad

Los pagos son **inmutables** por diseño. Una vez registrados:

1. **No pueden ser editados**: Cualquier intento de UPDATE lanza excepción
2. **No pueden ser eliminados**: Cualquier intento de DELETE lanza excepción
3. **Solo pueden ser anulados**: Por un administrador, con motivo obligatorio

```sql
-- Trigger que previene modificaciones
CREATE OR REPLACE FUNCTION clinic.prevent_pago_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo permitir cambio de estado a 'anulado'
  IF OLD.estado = 'activo' AND NEW.estado = 'anulado' THEN
    IF NEW.motivo_anulacion IS NULL THEN
      RAISE EXCEPTION 'Se requiere motivo para anular';
    END IF;
    NEW.anulado_at := NOW();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Los pagos no pueden ser modificados';
END;
$$ LANGUAGE plpgsql;
```

### Números de Recibo

Los números de recibo son **secuenciales y únicos**:

- Formato: `YYYY-NNNNNN` (ej: `2024-000001`)
- Nunca se reutilizan, incluso si se anula el pago
- Un salto en la secuencia es detectable y requiere investigación

```sql
-- Ejemplo: Si existen recibos 2024-000001 a 2024-000010
-- y falta el 2024-000005, esto es una ALERTA ROJA
```

### Evidencia Fotográfica

Cada pago requiere evidencia visual:

| Método | Evidencia Requerida |
|--------|---------------------|
| Efectivo | Foto del dinero recibido |
| Tarjeta | Foto del voucher del datáfono |
| Transferencia | Captura de pantalla del comprobante |

```typescript
// El componente de pago NO permite guardar sin foto
const validarPago = () => {
  if (!fotoComprobante) {
    throw new Error('La foto del comprobante es obligatoria');
  }
  // ...
};
```

## Sistema de Auditoría

### Tabla de Auditoría

Cada operación crítica se registra automáticamente:

```sql
CREATE TABLE audit.log (
  id UUID PRIMARY KEY,
  tabla VARCHAR(100) NOT NULL,        -- Tabla afectada
  registro_id UUID NOT NULL,          -- ID del registro
  accion VARCHAR(20) NOT NULL,        -- INSERT/UPDATE/DELETE
  datos_anteriores JSONB,             -- Estado antes del cambio
  datos_nuevos JSONB,                 -- Estado después del cambio
  campos_modificados TEXT[],          -- Lista de campos cambiados
  usuario_id UUID,                    -- Quién hizo el cambio
  ip_address INET,                    -- Desde qué IP
  user_agent TEXT,                    -- Navegador/dispositivo
  created_at TIMESTAMPTZ              -- Cuándo
);
```

### Tablas Auditadas

| Tabla | Operaciones Auditadas |
|-------|----------------------|
| pacientes | INSERT, UPDATE, DELETE |
| historias_clinicas | INSERT, UPDATE, DELETE |
| pagos | INSERT, UPDATE (anulación) |
| citas | INSERT, UPDATE, DELETE |
| cajas | INSERT, UPDATE |
| usuarios | INSERT, UPDATE |

### Información Capturada

Para cada operación se guarda:

```json
{
  "tabla": "clinic.pagos",
  "registro_id": "550e8400-e29b-41d4-a716-446655440000",
  "accion": "UPDATE",
  "datos_anteriores": {
    "estado": "activo",
    "monto": 100000
  },
  "datos_nuevos": {
    "estado": "anulado",
    "motivo_anulacion": "Paciente solicitó devolución",
    "anulado_por": "admin-uuid",
    "anulado_at": "2024-01-15T15:30:00Z"
  },
  "campos_modificados": ["estado", "motivo_anulacion", "anulado_por", "anulado_at"],
  "usuario_id": "admin-uuid",
  "ip_address": "192.168.1.100",
  "created_at": "2024-01-15T15:30:00.123Z"
}
```

## Detección de Anomalías

### Alertas Automáticas

El sistema genera alertas cuando detecta patrones sospechosos:

#### 1. Anulaciones Frecuentes

```sql
-- Alerta si un usuario anula más de 5 pagos en un mes
SELECT usuario, COUNT(*) as anulaciones
FROM pagos
WHERE estado = 'anulado'
  AND anulado_at > DATE_TRUNC('month', CURRENT_DATE)
GROUP BY anulado_por
HAVING COUNT(*) > 5;
```

#### 2. Diferencias de Caja

```sql
-- Alerta si hay diferencia > $50,000 en cierre
SELECT fecha, diferencia, justificacion_diferencia
FROM cajas
WHERE ABS(diferencia) > 50000
  AND fecha > CURRENT_DATE - INTERVAL '30 days';
```

#### 3. Accesos Fuera de Horario

```sql
-- Alerta si hay accesos entre 8pm y 7am
SELECT usuario_id, COUNT(*) as accesos_nocturnos
FROM audit.log
WHERE EXTRACT(HOUR FROM created_at) NOT BETWEEN 7 AND 20
  AND created_at > CURRENT_DATE - INTERVAL '7 days'
GROUP BY usuario_id
HAVING COUNT(*) > 3;
```

### Dashboard de Seguridad

Solo visible para administradores:

```
┌─────────────────────────────────────────────────────────────┐
│               PANEL DE SEGURIDAD                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⚠️ ALERTAS ACTIVAS (3)                                    │
│  ─────────────────────                                      │
│  🔴 María García - 8 anulaciones este mes                  │
│  🟠 Diferencia de $75,000 - Caja del 14/01                 │
│  🟡 3 accesos nocturnos - Juan Pérez                       │
│                                                             │
│  RESUMEN DEL MES                                            │
│  ────────────────                                           │
│  Total Pagos: 342                                           │
│  Total Anulaciones: 12 (3.5%)                               │
│  Diferencias de Caja: $-23,000                              │
│                                                             │
│  ÚLTIMAS ACCIONES SENSIBLES                                 │
│  ────────────────────────                                   │
│  15:30 - María anuló pago #2024-000125 ($95,000)           │
│  14:22 - Admin cerró caja con diferencia de $-5,000        │
│  11:05 - Juan modificó historia clínica HC-2024-00089      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Control de Acceso por Roles

### Matriz de Permisos

| Acción | Admin | Médico | Secretaria | Enfermera |
|--------|-------|--------|------------|-----------|
| Ver pacientes | ✅ | ✅ | ✅ | ✅ |
| Crear pacientes | ✅ | ✅ | ✅ | ❌ |
| Editar pacientes | ✅ | ✅ | ✅ | ❌ |
| Ver historias | ✅ | ✅ | Limitado | ✅ |
| Crear historias | ✅ | ✅ | ❌ | ❌ |
| Editar historias | ✅ | ✅ | ❌ | ❌ |
| Registrar pagos | ✅ | ❌ | ✅ | ❌ |
| Anular pagos | ✅ | ❌ | ❌ | ❌ |
| Cerrar caja | ✅ | ❌ | ✅ | ❌ |
| Ver reportes financieros | ✅ | ❌ | ❌ | ❌ |
| Ver auditoría | ✅ | ❌ | ❌ | ❌ |
| Ver alertas seguridad | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ |

### Implementación con RLS

```sql
-- Solo admins pueden anular pagos
CREATE POLICY "Anular pagos solo admin"
  ON clinic.pagos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clinic.usuarios
      WHERE auth_user_id = auth.uid()
      AND rol = 'admin'
    )
  );

-- Solo admins pueden ver auditoría
CREATE POLICY "Solo admins ven auditoría"
  ON audit.log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clinic.usuarios
      WHERE auth_user_id = auth.uid()
      AND rol = 'admin'
    )
  );
```

## Proceso de Anulación de Pagos

### Flujo Seguro

```
┌─────────────────────────────────────────────────────────────┐
│              PROCESO DE ANULACIÓN                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Secretaria detecta error/solicitud de devolución        │
│     ↓                                                       │
│  2. Notifica al administrador                               │
│     ↓                                                       │
│  3. Admin verifica en persona o por teléfono                │
│     ↓                                                       │
│  4. Admin ingresa credenciales y motivo                     │
│     ↓                                                       │
│  5. Sistema registra:                                       │
│     • Quién anuló (admin)                                   │
│     • Cuándo (timestamp)                                    │
│     • Por qué (motivo obligatorio)                          │
│     • Datos completos del pago original                     │
│     ↓                                                       │
│  6. Se genera alerta si hay patrones sospechosos            │
│     ↓                                                       │
│  7. Pago queda marcado como ANULADO (visible en reportes)   │
│                                                             │
│  ⚠️ El pago NUNCA se elimina de la base de datos           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Código de Anulación

```typescript
// Solo accesible para administradores
export async function anularPago(
  pagoId: string,
  motivo: string,
  passwordConfirmacion: string
) {
  const supabase = await createClient()

  // 1. Verificar que es admin
  const { data: { user } } = await supabase.auth.getUser()
  const { data: perfil } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('auth_user_id', user?.id)
    .single()

  if (perfil?.rol !== 'admin') {
    throw new Error('Solo administradores pueden anular pagos')
  }

  // 2. Verificar contraseña
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: passwordConfirmacion,
  })

  if (authError) {
    throw new Error('Contraseña incorrecta')
  }

  // 3. Validar motivo
  if (!motivo || motivo.length < 10) {
    throw new Error('El motivo debe tener al menos 10 caracteres')
  }

  // 4. Ejecutar anulación
  const { data, error } = await supabase
    .from('pagos')
    .update({
      estado: 'anulado',
      motivo_anulacion: motivo,
      anulado_por: user.id,
    })
    .eq('id', pagoId)
    .select()
    .single()

  if (error) throw error

  // 5. La auditoría se registra automáticamente via trigger

  return data
}
```

## Cierre de Caja

### Proceso Obligatorio

```
┌─────────────────────────────────────────────────────────────┐
│              PROCESO DE CIERRE DE CAJA                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Sistema calcula automáticamente:                        │
│     • Total efectivo recibido                               │
│     • Total tarjeta                                         │
│     • Total transferencias                                  │
│     • Anulaciones del día                                   │
│                                                             │
│  2. Secretaria cuenta efectivo físico                       │
│                                                             │
│  3. Sistema muestra diferencia:                             │
│     Esperado: $500,000                                      │
│     Contado:  $495,000                                      │
│     Diferencia: -$5,000                                     │
│                                                             │
│  4. Si hay diferencia > $10,000:                           │
│     • Justificación OBLIGATORIA                             │
│                                                             │
│  5. Foto del conteo OBLIGATORIA                             │
│                                                             │
│  6. Una vez cerrada, la caja NO se puede modificar          │
│                                                             │
│  7. Se genera reporte automático para administración        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Reportes de Seguridad

### Reporte Diario Automático

Se envía automáticamente al administrador:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REPORTE DE SEGURIDAD - 15 de Enero 2024
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RESUMEN FINANCIERO
─────────────────
Ingresos del día:      $1,250,000
  • Efectivo:          $  750,000
  • Tarjeta:           $  350,000
  • Transferencia:     $  150,000

ANOMALÍAS DETECTADAS
─────────────────────
⚠️ 0 alertas críticas
✅ 0 anulaciones
✅ Cierre de caja cuadrado (diferencia: $0)

ACTIVIDAD POR USUARIO
─────────────────────
María García:
  • 15 pagos registrados
  • 0 anulaciones

Juan Pérez:
  • 8 pagos registrados
  • 0 anulaciones

SESIONES ACTIVAS
────────────────
3 usuarios activos
0 accesos fuera de horario

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Backup y Recuperación

### Estrategia de Backup

- **Supabase**: Backups automáticos diarios incluidos
- **Retención**: 30 días en plan Pro
- **Point-in-time recovery**: Disponible en planes superiores

### Consideraciones

1. Las fotos de comprobantes se almacenan en Supabase Storage
2. Los backups incluyen tanto la base de datos como el storage
3. La auditoría NUNCA se elimina (retención indefinida)

## Checklist de Seguridad

### Antes del Despliegue

- [ ] RLS habilitado en todas las tablas sensibles
- [ ] Políticas de acceso verificadas
- [ ] Triggers de auditoría funcionando
- [ ] Triggers de inmutabilidad de pagos probados
- [ ] Variables de entorno configuradas correctamente
- [ ] CORS configurado solo para dominios permitidos

### Monitoreo Continuo

- [ ] Revisar alertas de seguridad diariamente
- [ ] Verificar reportes de cierre de caja
- [ ] Auditar anulaciones semanalmente
- [ ] Revisar logs de acceso mensualmente

### Capacitación de Personal

- [ ] Explicar por qué cada pago necesita foto
- [ ] Mostrar cómo el sistema detecta irregularidades
- [ ] Enfatizar que TODO queda registrado
- [ ] Establecer protocolo para reportar problemas
