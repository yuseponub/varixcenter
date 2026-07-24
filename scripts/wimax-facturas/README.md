# Espejo y robot programado de facturas WiMAX

Agente de una sola via: lee las facturas FE del mes actual y el anterior en
WiMAX/FoxPro y las refleja en Supabase. No crea, modifica ni elimina archivos
dentro de `WIMAX_DIR`.

## Instalacion en el PC de contabilidad

1. Instalar Node.js 20 o posterior.
2. Copiar esta carpeta al PC y ejecutar `npm ci`.
3. Copiar `.env.example` como `.env` y completar las tres variables.
4. Probar manualmente con `npm start`.
5. Programar `npm start` en el Programador de tareas de Windows con el usuario
   que ya tiene acceso de lectura a `C:\wimax`.

El agente registra cada intento en `sync_runs` con
`source='wimax_facturas'`. Al terminar el upsert llama
`cruzar_facturacion_wimax()`.

## Robot de emision

`robot.mjs` consume los trabajos creados por el boton **Crear factura** del
modulo Pagos. Corre con el Node portatil y una tarea interactiva en la sesion 1;
una tarea SSH/sesion 0 no puede dar foco de forma confiable a Xbase++.

Con `WIMAX_AUTO_START_ENABLED=true`, WiMAX puede estar cerrado. El agente solo
lo abre cuando ya existe una factura autorizada que va a procesar: despues de
que la persona acepta una urgente o cuando comienza el lote de cierre. Verifica
la ruta, tamano y SHA-256 de `C:\wimax\WIMAX.EXE`, selecciona exactamente
`VARIX CENTER S.A.S 2026`, envia la clave local y responde **No** a un maximo de
dos avisos de reorganizacion. Antes de reclamar el trabajo vuelve a reconocer
la marca calibrada de la empresa en la pantalla principal. Una ventana, empresa
o ejecutable diferente bloquea el arranque sin pulsar controles desconocidos.

La confirmacion final permite escoger uno de dos modos:

- **Crear ahora**: deja autorizado el snapshot exacto y muestra en el PC las
  opciones **Facturar ahora**, **Recordar en 5 min** y **Dejar para el cierre**.
  Solo la primera entrega voluntariamente teclado y pantalla al robot.
- **Facturar al cierre**: deja autorizado el mismo snapshot para el lote diario.
  A las `WIMAX_END_OF_DAY_TIME` el agente espera el tiempo de inactividad
  configurado, vacia todas las facturas autorizadas y espera un periodo quieto
  por si se estaba creando un lote.

El flujo tiene dos barreras independientes:

1. Antes de tocar la UI compara la cedula contra `wimax_facturas` y, de forma
   directa y solo lectura, contra `tmdir.dbf` y los `trafacMM.dbf` de la ventana
   del pago. Una FE reciente no consumida bloquea el trabajo; las FE que ya
   estan enlazadas uno-a-uno a otro pago se excluyen con evidencia auditable.
   El monto nunca se usa para ignorar un posible duplicado.
   Si el codigo de cliente calculado ya pertenece a otra cedula, prueba una
   secuencia determinista con la inicial del apellido y registra el fallback.
2. El robot prepara cliente, encabezado, items, deposito y banco. Los trabajos
   nuevos quedan preautorizados exclusivamente sobre el paciente, items y monto
   de la segunda confirmacion web. Los trabajos antiguos en modo `supervisada`
   conservan la barrera **Autorizar emision** antes del paso irreversible.

El modal permite escoger un monto positivo hasta el total del pago, ajustar las
lineas y exige una segunda pantalla de confirmacion. Si el monto confirmado es
menor, la conciliacion termina como `facturada_parcial`; nunca puede superar el
pago registrado.

Despues de emitir, el pago sigue pendiente hasta observar la nueva FE en
`trafac` y confirmar su CUFE. El robot intenta primero el DBF temporal
`tmfecufe.dbf`; si la version de WiMAX no lo llena, consulta la factura exacta en
ColFact y valida numero, fecha, cedula, monto, estado y el CUFE SHA-384 dentro del
XML oficial. Solo entonces enlaza la FE y marca el pago como facturado.

El conciliador de portal tambien revisa trabajos `emitida_sin_cufe`. El robot lo
ejecuta por lote despues de un periodo sin nuevas emisiones (120 segundos por
defecto), con reintentos limitados. Asi varias FE consecutivas se consultan
juntas y no queda un sondeo permanente cada cinco minutos. Si el portal no esta
disponible o cualquier dato difiere, el trabajo permanece protegido y el CUFE
se puede completar manualmente desde VarixCenter.

El watcher empieza antes del paso irreversible, consulta `tmfecufe.dbf` con alta
frecuencia y permanece activo durante `WIMAX_CUFE_GRACE_SECONDS` despues de ver
la FE en `trafac`.

Las credenciales de ColFact se configuran exclusivamente en `.env` mediante
`COLFACT_USERNAME`, `COLFACT_PASSWORD` y `COLFACT_EMISOR_NIT`, con
`COLFACT_RECONCILE_ENABLED=true`. El cliente rechaza cualquier URL que no sea
`https://nube.conexusit.com` para impedir el envio accidental de credenciales a
otro host.

El conciliador independiente queda disponible solo como recuperacion manual
(no usa la GUI ni puede emitir facturas), sin horario periodico:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-colfact-reconciler.ps1 -Enable
# Ejecutarlo cuando sea necesario:
Start-ScheduledTask -TaskName VarixWimaxColfact
```

### Salvaguardas operativas

- `WIMAX_ROBOT_ENABLED` debe ser literalmente `true`.
- El perfil UI debe tener `calibrated: true`; el ejemplo se entrega bloqueado.
- El proceso y la ventana de WiMAX deben pertenecer a la sesion interactiva
  configurada. En un PC fijo se recomienda `sessionId: 1`; en RDS/nube se usa
  `sessionId: "current"` para validar la sesion donde corre el propio agente.
- La resolucion debe coincidir con el perfil. Si el autoarranque esta
  deshabilitado, WiMAX debe estar abierto y autenticado manualmente.
- Si el autoarranque esta habilitado, WiMAX puede estar cerrado. El escritorio
  debe seguir desbloqueado e inactivo; el agente no puede iniciar una sesion de
  Windows ni trabajar en el escritorio bloqueado.
- Solo se reclama trabajo si existe una unica ventana principal de WiMAX; un
  dialogo residual obliga a revision humana.
- Antes de reclamar una tarea, el escritorio debe llevar al menos
  `WIMAX_MIN_IDLE_SECONDS` sin entrada humana y estar dentro de
  `WIMAX_ALLOWED_HOURS`, si se configuro.
- Una urgente omite el contador de inactividad solamente despues de que la
  persona del PC pulsa **Facturar ahora**. Una sesion bloqueada nunca emite.
- El cierre usa su propia barrera `WIMAX_END_OF_DAY_MIN_IDLE_SECONDS`. Para una
  cola no vacia, el usuario debe dejar la sesion iniciada y desbloqueada, WiMAX
  abierto en su unica pantalla principal y la resolucion calibrada.
- El PC no se apaga si queda una factura en cola, error, duplicado, revision,
  verificacion o pendiente de CUFE, ni mientras haya conciliacion programada.
  Tambien vuelve a exigir inactividad justo antes de ejecutar el apagado.
- `shutdown.exe` da el aviso configurado por `WIMAX_SHUTDOWN_DELAY_SECONDS`;
  durante ese plazo se puede cancelar manualmente con `shutdown /a`.
- Todos los trabajos usan lease atomico; un segundo agente no puede reclamarlos.
- Los screenshots se quedan exclusivamente en `WIMAX_STATE_DIR`, se refleja en
  Supabase solo su SHA-256 y se borran localmente segun
  `WIMAX_SCREENSHOT_RETENTION_HOURS`.
- El arranque no toma screenshots: reconoce la empresa con una firma de pixeles
  en memoria. `WIMAX_COMPANY_PASSWORD` solo vive en el `.env` local del PC y no
  se incluye en perfiles, Git, Supabase, evidencia ni mensajes de error.
- Los errores/logs usan ID de trabajo y paso, no nombres, cedulas, tratamientos
  ni service keys.
- ColFact debe devolver una unica factura exacta, completada y no fallida; el
  `CodigoTransaccion` y el UUID `CUFE-SHA384` del XML deben coincidir.

### Instalacion segura en CONTABILIDAD

1. Aplicar primero la migracion `068_wimax_invoicing_robot.sql` y ejecutar su
   prueba SQL en staging.
2. Copiar esta carpeta completa a `C:\varix-facturas\app` y ejecutar `npm ci`.
3. Fusionar las variables nuevas de `.env.example` en `.env`, inicialmente con
   `WIMAX_ROBOT_ENABLED=false`.
4. Copiar `robot-profile.contabilidad.example.json` como
   `robot-profile.contabilidad.json`. Verificar paso a paso atajos, titulos,
   orden TAB y screenshots en la sesion 1. Solo entonces cambiar
   `calibrated` a `true`.
   Para autoarranque, copiar tambien `wimax-startup.contabilidad.example.json`
   como `wimax-startup.contabilidad.json`, confirmar la huella del ejecutable y
   completar `WIMAX_COMPANY_PASSWORD` exclusivamente en el `.env` local.
5. Instalar la tarea, todavia deshabilitada:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-robot.ps1
   ```

6. Para la primera corrida, abrir/iniciar sesion en WiMAX, coordinar una ventana
   sin uso y ejecutar una sola iteracion:

   ```powershell
   $env:WIMAX_ROBOT_ENABLED='true'
   & C:\varix-facturas\node\node.exe .\robot.mjs --once
   ```

   El arranque se puede validar por separado, sin consultar ni reclamar la cola:

   ```powershell
   & C:\varix-facturas\node\node.exe .\robot.mjs --ensure-wimax
   ```

7. Tras validar una emision completa (FE en `trafac`, CUFE y estado en
   VarixCenter), configurar el cierre, dejar `WIMAX_ROBOT_ENABLED=true` en
   `.env` e instalar/activar:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-robot.ps1 -Enable
   ```

Al retirarse, el personal puede dejar WiMAX cerrado, pero la sesion de Windows
debe permanecer iniciada y desbloqueada. Si hay facturas, el PC permanece
encendido ante cualquier fallo; si todo termina limpio, se apaga. Al dia
siguiente debe encenderse e iniciar sesion de Windows normalmente (el encendido
automatico depende del BIOS y no del robot).

Para detenerlo sin tocar datos, deshabilitar la tarea `VarixWimaxRobot` y poner
`WIMAX_ROBOT_ENABLED=false`. Un trabajo que ya llego a `verificando` se revisa
manualmente; nunca se reencola a ciegas.

### Pruebas locales del agente

```powershell
npm test
```

Las pruebas crean DBF sinteticos en un directorio temporal y cubren cuenta de
cliente, colisiones, espejo cloud, `tmdir`/`trafac`, bloqueo por cualquier FE
reciente y escape de metacaracteres de SendKeys.

Para una prueba integral contra staging con DBF sinteticos temporales:

```powershell
$env:SUPABASE_URL="https://...supabase.co"
$env:SUPABASE_SERVICE_KEY="..."
npm run test:staging
```

La prueba compara hashes antes/despues para demostrar que el agente no modifica
los DBF y elimina de staging sus dos facturas sinteticas al finalizar.

Los campos FoxPro principales se buscan primero por sus nombres verificados
(`TIPO`, `NUMERO`, `EMISION`, `CLAVE`, `TOTAL`; `DIREC4` en `tmdir.dbf`) y se
aceptan alias comunes para tolerar variaciones de version. Si falta un campo
obligatorio, el agente falla mostrando los campos disponibles en el log.
