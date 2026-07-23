# Espejo y robot supervisado de facturas WiMAX

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

El flujo tiene dos barreras independientes:

1. Antes de tocar la UI compara la cedula contra `wimax_facturas` y, de forma
   directa y solo lectura, contra `tmdir.dbf` y los `trafacMM.dbf` de la ventana
   del pago. Cualquier FE reciente bloquea el trabajo; nunca se sobreescribe la
   decision de dedup por monto.
2. El robot prepara cliente, encabezado, items, deposito y banco, pero se detiene
   en **Asignacion de asiento contable**. Un Admin o Secretaria debe revisar el
   escritorio y pulsar **Autorizar emision** en VarixCenter. Solo entonces se
   acepta el paso irreversible.

Despues de emitir, el pago sigue pendiente hasta observar la nueva FE en
`trafac` y su CUFE en el DBF temporal `tmfecufe.dbf`. Si WiMAX crea la FE pero el
CUFE no alcanza a capturarse, el trabajo queda `emitida_sin_cufe`: no se reintenta
ni se vuelve a emitir; el CUFE se completa manualmente desde ConexusIT.

El watcher empieza antes del paso irreversible, consulta `tmfecufe.dbf` con alta
frecuencia y permanece activo durante `WIMAX_CUFE_GRACE_SECONDS` despues de ver
la FE en `trafac`.

### Salvaguardas operativas

- `WIMAX_ROBOT_ENABLED` debe ser literalmente `true`.
- El perfil UI debe tener `calibrated: true`; el ejemplo se entrega bloqueado.
- El proceso y la ventana de WiMAX deben pertenecer a la sesion interactiva 1.
- La resolucion debe coincidir con el perfil y WiMAX debe estar abierto.
- Solo se reclama trabajo si existe una unica ventana principal de WiMAX; un
  dialogo residual obliga a revision humana.
- Antes de reclamar una tarea, el escritorio debe llevar al menos
  `WIMAX_MIN_IDLE_SECONDS` sin entrada humana y estar dentro de
  `WIMAX_ALLOWED_HOURS`, si se configuro.
- Todos los trabajos usan lease atomico; un segundo agente no puede reclamarlos.
- Los screenshots se quedan exclusivamente en `WIMAX_STATE_DIR`, se refleja en
  Supabase solo su SHA-256 y se borran localmente segun
  `WIMAX_SCREENSHOT_RETENTION_HOURS`.
- Los errores/logs usan ID de trabajo y paso, no nombres, cedulas, tratamientos
  ni service keys.

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

7. Tras validar una emision completa (FE en `trafac`, CUFE y estado en
   VarixCenter), dejar `WIMAX_ROBOT_ENABLED=true` en `.env` e instalar/activar:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-robot.ps1 -Enable
   ```

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
