# Auditoría y mejoras — Julio 2026

Registro de la auditoría integral, los arreglos aplicados y el nuevo esquema de
entornos. Rama: `mejoras-2026-07`.

## Entornos

| Entorno | URL | Base de datos | Uso |
|---|---|---|---|
| Producción (front viejo) | varixcenter.vercel.app | Supabase `gojqjfuszghfqvdnjjxa` (varix-clinic) | Lo que usa la clínica hoy. NO tocar hasta promover v2. |
| **v2 (front nuevo)** | varixcenter-v2.vercel.app | El MISMO Supabase de producción | Versión mejorada. Al aprobarse, reemplaza al viejo. |
| **Staging** | (local `npm run dev` o preview de v2) | Supabase `yobnjmdzxvbizoxfgqld` (varix-staging) | Copia completa de producción (16-jul-2026). Aquí se prueban migraciones. |

### Respaldos (16-jul-2026)
- `backups/varix-full-*.dump` — dump completo (public + auth + storage), formato pg_restore
- `backups/schema-public-*.sql`, `backups/data-*.sql` — SQL plano
- `backups/storage/` — 290 comprobantes de pago (615 MB)
- Staging es además una copia viva restaurada y verificada (34 tablas con conteos idénticos)
- ⚠️ `backups/` contiene datos médicos reales: NUNCA subir a GitHub/Drive públicos

### Regla para migraciones nuevas
1. Escribir `supabase/migrations/0NN_*.sql`
2. Aplicar y probar en staging
3. Aplicar en producción (psql o SQL editor)
4. Commit

## Arreglos de seguridad aplicados (auditoría)

| ID | Qué era | Arreglo |
|---|---|---|
| C1 | `/api/ocr` y `/api/transcribe` abiertos a internet (gasto de OpenAI) | Requieren sesión (401 sin login) |
| A2 | El RPC de pagos confiaba en el precio del navegador | Migración 056: valida contra catálogo (piso/techo), `total = subtotal − descuento`, `created_by = auth.uid()`; elimina sobrecarga vieja |
| M1 | Contadores de facturas editables por cualquier usuario | Migración 057: REVOKE UPDATE + drop de políticas permisivas |
| M2 | Anular venta de medias deshabilitaba el trigger de inmutabilidad de TODA la tabla | Migración 058: flag transaccional por fila |
| M3 | Cualquier usuario podía editar la nota de un pago | Solo admin/médico |
| A1 | Migraciones con números duplicados (020/026/027) | Renumeradas a 053/054/055 |
| A3/B2 | Build ignoraba errores de TypeScript; tipos desactualizados | Tipos regenerados desde la BD real; build estricto activado |

Todas probadas en staging y aplicadas a producción el 16-jul-2026 (verificado:
pago legítimo pasa, precio manipulado se rechaza, contadores bloqueados).

**Bug extra encontrado en verificación**: el middleware de autenticación
interceptaba `/api/cron/send-reminders`, redirigiendo la invocación del cron de
Vercel a /login — **los recordatorios SMS probablemente nunca se enviaron** en
el front viejo. Corregido en v2 (el endpoint se protege solo con CRON_SECRET).
Al promover v2 con `ENABLE_CRON=true`, los recordatorios funcionarán por
primera vez; conviene monitorear `/notificaciones` los primeros días.

## Mejoras funcionales

- **Cita en un renglón** (`/citas`): barra rápida — paciente con autocompletado
  (o creación inline con celular + cédula opcional), fecha, hora, duración,
  servicio y doctor opcionales → Enter. El formulario completo sigue en
  `/citas/nueva` para casos complejos.
- **Dashboard operativo**: citas de hoy, pagos de hoy, accesos rápidos, estado
  de sincronización con Access (admin) y panel de seguridad.
- **Quick wins de tablet**: teclado numérico (`inputMode`), cámara directa
  (`capture`), autofocus, cierre de medias con fecha de hoy, saneo de dígitos.

## Sincronización con Access (scripts/sync-access/)

Agente one-way **Access → Supabase** que corre cada hora en el PC de la clínica
(instrucciones en `scripts/sync-access/INSTALAR.md`).

- Pacientes: solo INSERTA nuevos (match por cédula). Nunca modifica existentes.
- Historias/planes: espejo en `patient_legacy_records`; inserta nuevos y
  actualiza cuando Access tiene más sesiones que Supabase. Nunca borra.
- Cada corrida queda en la tabla `sync_runs` → visible en el dashboard admin.
- Probado en staging con los CSV reales: idempotente (2ª corrida = 0 cambios).
- Modo prueba local: `node scripts/sync-access/sync.mjs --from-csv scripts`

**Pendiente**: instalarlo en el PC de la clínica (necesita ~15 min con acceso
al equipo, ver INSTALAR.md) y pasarle la service key por canal seguro.

## Decisiones pendientes del dueño

1. **Alerta "recetó medias y no compró"** (prioridad 5 del brief): hoy no existe
   forma de registrar la receta de medias — el catálogo de servicios no tiene
   ítem de medias. Propuesta: agregar servicio "Medias de compresión" (categoría
   propia) para que el médico lo incluya en el plan de tratamiento, y un widget
   que cruce eso contra `medias_sales` por paciente. Decidir si el flujo clínico
   lo adopta.
2. **Historias: "Crear Historia" y "Guardar Borrador" hacen lo mismo** (ambos
   guardan `borrador`, `medical-record-form.tsx`). ¿Debe existir "finalizar"
   desde el formulario? (Existe `completeMedicalRecord` pero no está conectado ahí.)
3. **Búsqueda global** (escribir cédula desde cualquier pantalla → ficha):
   recomendada como siguiente mejora grande.
4. **Devoluciones de medias multi-ítem** y **buscador de paciente en venta de
   medias** (hoy carga todos los pacientes al cliente): mejoras grandes anotadas.
5. **Control de gastos** (fase 16 planificada): sin implementar.
6. **Citas viejas de Outlook**: la migración quedó bloqueada por el matching de
   nombres; como Outlook se reemplaza por la agenda del sistema, se descarta
   salvo que se necesite el histórico.

## Promoción de v2 (cuando el usuario apruebe)

1. `vercel promote <deployment-v2> --scope jose-romeros-projects-5fe69631`
2. En Vercel (proyecto varixcenter-v2): `ENABLE_CRON=true` (recordatorios SMS)
3. Pausar/apagar el proyecto viejo `varixcenter` (o dejarlo como respaldo sin cron)
4. Avisar a la clínica la URL nueva

⚠️ Mientras coexistan: solo el front viejo envía recordatorios SMS (v2 tiene
`ENABLE_CRON=false` para no duplicar mensajes).
