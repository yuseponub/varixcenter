# Sincronización de agenda Outlook ↔ Varix

## Qué queda sincronizado

La integración usa Microsoft Graph y mantiene una copia mínima de la agenda de
Outlook en Supabase. No almacena el cuerpo del evento ni los asistentes.

- Outlook → Varix: altas, cambios de horario y cancelaciones llegan por webhook
  y se concilian con consultas incrementales (`delta`).
- Varix → Outlook: las citas nuevas, editadas, reprogramadas o canceladas se
  guardan en un outbox y se reintentan si Microsoft está temporalmente caído.
- La agenda de Varix mezcla ambos orígenes. Los eventos Outlook no asociados se
  ven en violeta; los conflictos se ven en rojo.
- El navegador refresca la agenda cada 30 segundos. Un cron de respaldo corre
  cada 15 minutos y renueva la suscripción de Microsoft antes de que expire.
- Las 163 citas importadas que se detectaron en la auditoría del 22 de julio de
  2026 se concilian por asunto y hora para no mostrarlas dos veces. Una
  coincidencia ambigua se conserva como conflicto en vez de vincularse
  automáticamente.

Microsoft Graph con este modo de servicio solo puede leer un buzón empresarial
alojado en Exchange Online/Microsoft 365. Una cuenta personal `outlook.com`, un
calendario que exista únicamente dentro de un PST local o una cuenta IMAP abierta
desde Outlook no son visibles para esta conexión: en esos casos hay que migrar
el buzón a Microsoft 365 o crear un agente local adicional en el PC de recepción.

## Preparación en Microsoft 365

Se necesita una cuenta administrativa de Microsoft 365 y el correo exacto del
buzón donde recepción registra las citas.

1. Registrar una aplicación en Microsoft Entra ID y crear un secreto de cliente.
2. Conceder acceso de aplicación `Calendars.ReadWrite`, ya que Varix debe leer y
   también crear, modificar y cancelar eventos sin que una persona mantenga una
   sesión abierta.
3. Recomendado: usar Exchange Online Application RBAC con el rol
   `Application Calendars.ReadWrite` y limitar el alcance únicamente al buzón de
   agenda. Si se usa RBAC, quitar el permiso equivalente y no acotado de Entra;
   Microsoft indica que ambos permisos son aditivos y el permiso global anularía
   el aislamiento por buzón.
4. Probar el alcance con `Test-ServicePrincipalAuthorization -Resource
   agenda@dominio.com -Identity <app>`.

Referencias oficiales:

- https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac
- https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview
- https://learn.microsoft.com/en-us/graph/delta-query-events

## Variables de entorno

Copiar la sección Outlook de `.env.local.example` a Vercel y completar:

```env
ENABLE_OUTLOOK_SYNC=true
MICROSOFT_TENANT_ID=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
OUTLOOK_MAILBOX=agenda@dominio.com
OUTLOOK_CALENDAR_ID=calendar
NEXT_PUBLIC_APP_URL=https://dominio-publico-de-varix.com
OUTLOOK_WEBHOOK_CLIENT_STATE=secreto-aleatorio-largo
OUTLOOK_SYNC_PAST_DAYS=30
OUTLOOK_SYNC_FUTURE_DAYS=400
CRON_SECRET=otro-secreto-aleatorio-largo
```

`OUTLOOK_CALENDAR_ID=calendar` usa el calendario predeterminado del buzón. La
consulta incremental estable de Microsoft Graph v1.0 se limita aquí a ese
calendario; si recepción usa uno secundario, se deben mover esas citas al
calendario predeterminado antes de activar la integración.

Los dos secretos aleatorios deben ser diferentes. Nunca se deben guardar en el
repositorio ni enviarse por un canal público.

## Orden de activación

1. Mantener `ENABLE_OUTLOOK_SYNC=false` mientras se prepara la infraestructura.
2. Aplicar `supabase/migrations/065_outlook_calendar_sync.sql`.
3. Desplegar el código y verificar que la URL pública responda a la validación
   del webhook.
4. Configurar las variables en Vercel y cambiar `ENABLE_OUTLOOK_SYNC=true`.
5. Ejecutar una vez el cron autenticado:

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://dominio-publico-de-varix.com/api/cron/sync-outlook
   ```

6. Abrir `/citas`: debe aparecer el indicador verde con la hora de la última
   sincronización y los eventos Outlook en violeta.

Importante para este proyecto: el historial remoto de migraciones no está
alineado con los archivos locales; el `dry-run` actual intenta volver a enviar
desde `001`. No se debe ejecutar `supabase db push` directamente. Hay que aplicar
solo `065_outlook_calendar_sync.sql` desde el SQL Editor de Supabase o reparar
primero el historial de migraciones.

La primera ejecución hace la lectura completa de 30 días hacia atrás y 400
días hacia adelante. Después usa el token incremental opaco guardado solo para
el servicio. Si el webhook se pierde, el cron recupera los cambios pendientes.

## Verificación local

```bash
npm run type-check
npm run test:outlook
npm run build
node --check scripts/sync-access/sync.mjs
```

El código tolera que la migración aún no esté aplicada o que la integración esté
desactivada: la agenda nativa de Varix sigue funcionando y muestra el estado de
Outlook como pendiente/desactivado.

El proyecto Vercel vinculado está actualmente en plan Pro, que admite el cron de
15 minutos. En Hobby esa frecuencia impediría el despliegue y habría que usar un
programador externo o reducir el cron a una ejecución diaria.
