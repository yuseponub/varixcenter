# Robot de facturación WiMAX

**Mapeo inicial:** 2026-07-23 · **Calibración integral:** 2026-07-24 · **Rama base:** `mejoras-2026-07` · **SHA:** `0271cfc52c97b53163d4377ffbf839bd8a17298a`

**Estado:** implementado con arranque autenticado desde WiMAX cerrado, cola
urgente/cierre, deduplicación DBF+nube, emisión por UI en sesión 1 y
conciliación CUFE contra XML oficial de ColFact.

## Objetivo

Automatizar la emisión de facturas electrónicas (DIAN) en **WiMAX** (app contable Xbase++ de la clínica) a partir de los **pagos con tarjeta** registrados en VarixCenter. Meta: un botón **"Crear factura"** dentro del módulo **Pagos** de VarixCenter que, con los tratamientos+valores del pago pre-cargados (editables), dispare un **robot en background** que replica el flujo manual en WiMAX y emite la factura.

**Regla de negocio:** se factura cuando el pago fue por **tarjeta** (o el paciente pide factura). Los pagos en efectivo NO se facturan salvo solicitud. El "valor real" a facturar es el que la persona pagó en VarixCenter (editable), NO el precio del catálogo de WiMAX.

## Acceso e infraestructura

- **PC WiMAX (contabilidad):** `ssh user@100.119.0.100` (Tailscale, cuenta `varixcenter@`, llave `~/.ssh/id_ed25519`, shell por defecto PowerShell). WiMAX en `C:\wimax`, empresa seleccionada en GUI **VARIX CENTER S.A.S 2026**, datos fiscales en `CENTER26` (NIT 900343036, usuario de login CIRO).
- **Node portátil:** `C:\varix-facturas\node\node.exe`. App espejo: `C:\varix-facturas\app\` (usa `dbffile`).
- **Canal de "ojos" (screenshots):** tarea programada interactiva **`VarixShot`** (`schtasks /run /tn VarixShot`) captura `C:\varix-facturas\pantalla.png` (traer con scp). **SSH corre en sesión 0 sin acceso a GUI** — para ver/manejar la GUI hay que usar tareas interactivas en la sesión 1.
- **Supabase producción:** URL + `SUPABASE_SERVICE_ROLE_KEY` en `varix-clinic/.env.local`. Tablas relevantes: `payment_invoicing`, `wimax_facturas`, `payments`, `payment_items`, `patients`.
- **DBFs de WiMAX (solo lectura):** clientes `C:\wimax\CENTER26\tmdir.dbf` (cédula en `DIREC4`, código en `CLAVE` [5 chars]), facturas `trafacMM.dbf`/`trafac07.dbf` (total `TOTAL_FAC`, cliente `CLIENTE`=código, `TIPO`="FE"). Catálogo `tmdfainv.dbf` NO se lee con dbffile ("Incorrect record length") — mapear por UI.

## Fuente de datos (qué facturar)

Cola `payment_invoicing` (migración 064): trigger crea fila `pendiente` cuando un `payment_methods.metodo='tarjeta'`. RPC `cruzar_facturacion_wimax()` empareja pendientes con facturas ya en `wimax_facturas` por cédula+ventana de fechas+monto.

El falso positivo histórico del cruce quedó cubierto en las migraciones
068/070: cada FE se consume una sola vez y, antes de tocar la UI, el agente
vuelve a verificar `wimax_facturas` **y** los DBF `tmdir`/`trafac` por identidad
del pago. Una FE reciente de la misma cédula bloquea la emisión y exige revisión;
el robot nunca intenta “resolver” esa ambigüedad creando otra factura.

## Arranque desde cero

El agente no presupone que WiMAX está abierto. Cuando existe un trabajo
autorizado, valida ruta, tamaño y SHA-256 de `C:\wimax\WIMAX.EXE`, lo lanza en
la sesión interactiva 1, selecciona exactamente **VARIX CENTER S.A.S 2026**,
envía la clave desde el `.env` local, responde **No** a hasta dos avisos de
reorganización, selecciona el prefijo **FE FACTURACION ELECTRONICA** y cierra
`Estado actual` y `Auditoria General`. Solo considera listo el escritorio si
queda una única ventana principal reconocida durante tres segundos.

La clave nunca entra en Git, perfiles, argumentos, screenshots, Supabase ni
mensajes de error. Una sesión de Windows bloqueada sigue siendo un bloqueo:
abrir WiMAX no equivale a iniciar sesión en Windows.

## Flujo UI completo en WiMAX (calibrado por observación 22-24 jul 2026)

### A. Crear cliente (si no existe) — dentro de la factura

El robot abre primero Facturación General. Al escribir un código inexistente en
Cuenta, WiMAX abre `El Directorio Principal`; ese es el único punto de entrada
automatizado para altas. Al guardar, responde **Sí** a “¿Desea trabajar con
otra factura?” y completa de nuevo el encabezado fresco. Esto evita mezclar el
flujo del Directorio general con el estado de una factura en curso.

Pestaña **Datos Generales**:
- **Cuenta** (código, 5 chars) = **primeros 2 dígitos de la cédula + primeras 3 letras del PRIMER NOMBRE** (ej. cédula 63485281 + RAQUEL → `63RAQ`; 1098627818 + SANDRA → `10SAN`). Verificar colisión en `tmdir.CLAVE`.
- Tipo de identificación: **Cédula Ciudadanía**. No. Cédula = la cédula. D.V. vacío.
- Persona Jurídica = **N**, Declarante Renta = **N**, Estado = **A**.
- Primer Apellido, Segundo Apellido, Primer Nombre, Segundo Nombre. (Razón social se autollena con el nombre completo.)
- Depto **Santander** / Ciudad **Bucaramanga** / Código Postal **680011** (defaults). Celular del paciente.

Pestaña **Datos Tributarios**: **Régimen = "Natural o Unipersonal"** (código P; el 95% de clientes). Mapa: C=Común, S=Simplificado, G=Gubernamental, P=Natural. → **Aceptar**.

### B. Crear la factura — `Movimientos → Ventas → Facturación General`
1. El menú nativo debe abrirse en una sola acción: **Alt+M, abajo, derecha, Enter**. Separar esas teclas en procesos distintos vuelve a enfocar WX y cierra el menú.
2. El prefijo FE ya fue confirmado por el arranque. En el formulario, reemplazar Tipo por `FE`, salir con TAB y aceptar la primera opción **Venta de Contado**.
3. **Cuenta:** escribir el código del cliente y Enter. Si no existe, se ejecuta el alta descrita en A y se reinicia este encabezado.
4. **Método de Pago = 1, Instrumento no definido**. Aceptar el encabezado e ingresar como detalle el número inmutable del pago Varix (`FAC-...`) y el nombre.
5. En cada renglón escribir directamente la Referencia y Enter. El editor Xbase++ expone exactamente tres controles nativos `Edit`, ordenados de izquierda a derecha: **Cantidad, Precio, Descuento**. El robot valida esa estructura, escribe cantidad/precio/0 y confirma el renglón. Después del último cancela únicamente el renglón blanco nuevo.

**Catálogo de tratamientos (Referencia → Descripción):**
`41651001CONSULT`=CONSULTA VALORACION · `41651002ECOREA` · `41651003CONTROL`=CONTROL · `41651004DUPLEX` · `41651005ECOREAB`=ECOREABSORCION · `41651006FLEBECT`=FLEBECTOMIA · `41651007FOTOPLE`=FOTOPLETISMO · `41651009LASEREN`=LASER ENDOVASCULAR · `41651010PRESOT`=PRESOTERAPIA · `41651010LASERSU`=LASER SUPERFICIAL · `41651011SCANEO` · `41651012SCANEPR`=SCANEO PRE-TTO · `41651013DEPILAC`=HIPERTRICOSIS · `41651014FOTOREJ` · `41651015ESCLER`=ESCLEROTERAPIA SESION · `41651016INSUMO`=MEDIAS · `41651017INSUMO`=FRAGMIN · `SES`=SESION · `CREMA ARNICA` · `FRAXIPARINE` · `VAES`.

**Mapeo servicio VarixCenter → código WiMAX:** Valoracion→`41651001CONSULT`; Control→`41651003CONTROL`; "Sesion Piernas"→`SES`; Medias→`41651016INSUMO`; Esclero→`41651015ESCLER`; ECOR→`41651005ECOREAB` (por confirmar). IVA 0% (servicios de salud exentos), sin retenciones.

### C. Cierre / cobro / envío DIAN
1. Con los ítems en la grilla → tecla **`t`** (terminar) → `Impuestos` → **Aceptar**.
2. Se abre **"FORMA DE PAGO"** (Valor a Cobrar = total) → **Nuevo** → selector **"Tipos"** (CH Cheque, FE Efectivo, DP Depósito, TJ Tarjeta, NC Nota Contable) → elegir **DP Depósito** → Aceptar.
3. En **Cuenta** se abre **"Caja/Bancos"** → elegir **la corriente `1.1.10.05.01.03` (Bancolombia cta cte 79371357766)** → Aceptar. (Otras: 1.1.05.05 Caja general, 1.1.05.10 Cajas menores, 1.1.10.05.01.01 Bancolombia 08914243763.)
4. Queda la línea (Tipo DP, Código 1.1.10.05.01.03, Número=`FAC-...`, Detalle=`FAC-... <NOMBRE>`, Valor=total) → tecla **`t`** otra vez.
5. Sale **"Asignación de asiento contable"**. Esta ventana es la barrera previa al paso irreversible.
6. Tras Aceptar: confirmar impresión, escoger formato **MODFV**, confirmar `Archivo a generar Factura Venta`, exigir el aviso exacto **“Factura de venta enviada exitosamente a ColFact”**, escoger **GERE1** para el comprobante de ingreso y responder **No** a hasta dos preguntas “¿Desea trabajar con otra factura?”.
7. **La transmisión a la DIAN es AUTOMÁTICA** al aceptar el asiento contable. No hay botón separado: ese Aceptar es irreversible.

## Reto técnico central

WiMAX es **Xbase++** (ventanas clase `XbpDialog`, campos `XbpStatic`). Solo recibe teclado **con foco**. Desde SSH (sesión 0) **no** se puede inyectar input a la GUI de forma confiable: Windows bloquea `SetForegroundWindow` desde procesos en background y Xbase++ ignora mensajes sin foco. **Arquitectura recomendada:** el robot debe correr como **tarea interactiva en la sesión 1** (o sesión RDP dedicada/desconectada, o mini-PC como 2º terminal), enviando teclas con foco garantizado (SendKeys/UI Automation), y verificando cada paso por screenshot antes de avanzar. Correr por tandas en horas muertas si comparte escritorio con la contadora.

## UX del botón "Crear factura" (módulo Pagos de VarixCenter)

Al dar clic en un pago (tarjeta, no facturado), el modal muestra los **tratamientos + valores del pago pre-seleccionados** pero **editables** (tratamiento/cantidad/precio). Default = un clic. El backend encola el trabajo (cédula, nombres, lista de ítems código+cantidad+precio) para que el robot lo ejecute en WiMAX. Marcar el pago como facturado (con número FE + CUFE) solo cuando el robot confirme éxito.

## Verificación / ver facturas emitidas

- **Fuente autoritativa para dedup y estado:** los DBF de WiMAX (`wimax_facturas` espejo + `tmdir`/`trafac`).
- **Portal del proveedor DIAN (ConexusIT):** `https://nube.conexusit.com/admin/login/` — ahí se consultan las facturas electrónicas transmitidas (PDF/CUFE, estado DIAN). Credenciales las tiene el dueño (NO se guardan en este repo). Útil para verificación manual post-emisión, no para el flujo automático.

El agente inicia un watcher de `tmfecufe.dbf` antes de aceptar el asiento. Si el
buffer temporal no conserva el CUFE, espera el final del lote y consulta la FE
exacta en ColFact; valida número, fecha, cédula, total, estado completado y que
el `CodigoTransaccion` coincida con el UUID `CUFE-SHA384` del XML oficial. La
migración 072 ofrece una recuperación explícita para una FE ya observada en
`trafac` durante calibración; nunca emite y tampoco completa el pago antes del
CUFE.

### Validación supervisada del 24 de julio de 2026

- `FE7866`, $190.000: observada en `trafac07.dbf`, éxito ColFact y CUFE XML confirmado.
- `FE7867`, $100.000: cliente nuevo creado desde la factura, observada en `trafac07.dbf`, éxito ColFact y CUFE XML confirmado.
- Ambas quedaron enlazadas en VarixCenter como `facturada_total`; repetir el preflight devuelve duplicado.
- El smoke final partió de `WxCount=0`, registró `opened=true`, abrió y canceló
  Facturación sin ingresar datos, terminó con código 0 y volvió a cerrar WiMAX.

## Salvaguardas obligatorias

- **Dedup antes de emitir** (cédula en `tmdir`/`trafac` + `wimax_facturas`): jamás emitir si ya existe factura para ese pago → duplicado real DIAN.
- **Solo lectura sobre `C:\wimax`** para verificación; la escritura ocurre solo por la UI de WiMAX.
- Las primeras emisiones se validaron supervisadas. Los modos urgente/cierre
  solo operan sobre el snapshot exacto aprobado en la segunda confirmación web.
- Nunca subir PII médica ni service keys a repos/logs externos.
