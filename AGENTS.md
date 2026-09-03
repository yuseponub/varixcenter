# Varix Clinic — contrato operativo para agentes

## Contexto

VarixCenter es el sistema de gestión de una clínica flebológica: historias
clínicas, agenda, pagos anti-fraude, cierre de caja, venta de medias e
integraciones con el PC de recepción (Outlook/Access) y el portal WiMAX de
facturación electrónica.

Stack: Next.js 16 + React 19 + TypeScript estricto, Supabase (PostgreSQL, Auth,
Storage, RLS), TanStack Table, React Hook Form + Zod, Tailwind 4 + shadcn/ui,
Twilio. Despliegue en Vercel. La zona horaria funcional es siempre
`America/Bogota`.

La rama de trabajo por defecto es `mejoras-2026-07`, no `main`.

Este repositorio es autónomo: no depende de MorfX ni comparte su código,
convenciones ni invariantes. Lo único compartido es el Workboard, que actúa
como control plane de trabajo para varios repos.

Antes de cambiar código:

- Localiza el dueño real del comportamiento, sus consumidores y los cambios
  locales pendientes. El código vigente manda sobre la documentación histórica.
- Revisa `docs/` y `.planning/STATE.md` solo si aportan contexto vigente; son
  memoria del proyecto, no puertas de aprobación. El `README.md` describe el
  producto como se diseñó, no como está: varias reglas que enuncia fueron
  relajadas por migraciones posteriores. Verifica en `supabase/migrations/`
  antes de tratar una de ellas como invariante.

## Workboard (control plane de trabajo)

El tablero multi-repo vive en un repositorio hermano. Los items de Varix Clinic
se registran en `.git/morfx-workboard-items.json` de este repo, pero **solo**
mediante las primitivas de ese repositorio; nunca edites ese JSON a mano.

Este repo no contiene una copia del runtime. Las primitivas operan sobre el
directorio actual, así que se ejecutan desde dentro del worktree de Varix que
estés usando. Define la ruta una vez por sesión:

```bash
export WB=/home/jose/proyectos/morfx-workboard
node $WB/tools/workboard/prepare.mjs -- --help
```

Resuelve continuidad **antes** de la primera escritura:

```bash
node $WB/tools/workboard/prepare.mjs -- --item <id> --mode continue
node $WB/tools/workboard/prepare.mjs -- --item <id> --mode new --title "<resultado>" --next "<acción>"
node $WB/tools/workboard/prepare.mjs -- --item <id> --mode child --scope "<responsabilidad>"
node $WB/tools/workboard/prepare.mjs -- --item <id> --mode readonly
```

Entra al worktree reportado y confirma `pwd` y `git branch --show-current`. La
rama base de un item nuevo es la declarada para este repo en
`$WB/workboard.config.json` (`mejoras-2026-07`), no `main`. Luego registra rama,
primaria, instancia, estado, siguiente acción y ruta cuando aplique:

```bash
node $WB/tools/workboard/link.mjs -- --item <id> --title "<resultado>" --state active \
  --next "<acción>" --branch "$(git branch --show-current)" \
  --primary "$(git branch --show-current)"
```

Cierra cada turno con `handoff.mjs` (pausa o transferencia) o con `finish.mjs`
(ejecuta los criterios `AC-xxx` y registra evidencia). Un item cuyo cierre
depende de un gate humano queda en `review`; quien ejecute ese gate (merge,
migración, aprobación) cierra el item en ese mismo momento.

Este repo está declarado en el Workboard con módulos propios —`clinic`,
`medias`, `integrations`, `data`, `platform`, `planning`— derivados de las rutas
que toque el trabajo. No los inventes: la clasificación sale de la config.

## Invariantes de implementación

Verificadas contra el schema vigente, no contra el `README.md` — que en varios
puntos describe reglas que migraciones posteriores relajaron. Donde el código y
la documentación difieren, manda lo que dice aquí:

- **Pagos inmutables.** El único cambio de estado permitido es
  `activo → anulado`, con justificación y trigger que lo hace cumplir
  (`supabase/migrations/009`, `010`). Un pago no se edita ni se borra. Nunca
  introduzcas un camino de escritura que rompa esa transición única.
- **Numeración sin gaps.** `numero_factura` (`FAC-000001`) sale de
  `get_next_invoice_number()` con bloqueo exclusivo, no de una secuencia de
  PostgreSQL, precisamente para evitar huecos por rollback. No la sustituyas
  por `SERIAL`/`SEQUENCE` ni la generes en código de aplicación.
- **Evidencia fotográfica: opcional, no obligatoria.** El README describe "foto
  obligatoria en cada pago", pero `migrations/049` eliminó el constraint
  `comprobante_required_for_electronic` en `payment_methods` y en
  `medias_sale_methods`. Hoy `comprobante_path` se puede adjuntar y no se
  exige. No reintroduzcas la obligatoriedad sin decisión explícita del usuario,
  ni asumas que el campo viene lleno.
- **Storage append-only.** El bucket `payment-receipts` no admite DELETE ni
  UPDATE (`migrations/011`). Si un comprobante está mal, se anula el pago y se
  registra uno nuevo; no se sobrescribe el archivo.
- **Log de auditoría inmutable** a nivel de RLS (`migrations/002`). No lo relajes.
- **Cédula de paciente:** inmutable una vez fijada, pero desde `migrations/041`
  es nullable y ya no es única. Trátala como identificador opcional.
- **Cierre de caja.** Cualquier diferencia entre conteo físico y sistema exige
  justificación de al menos 10 caracteres, validada en el RPC
  (`migrations/016`, vigente en `075`). Los descuentos exigen justificación de
  al menos 5 (`migrations/012`). Esas dos no se relajan. La foto del cierre, en
  cambio, es opcional desde `migrations/017` (y `026` para medias).
  Reabrir un cierre exige admin y queda registrado en `reopened_by`.
- **Borrado de citas.** Por RLS solo admin borra filas de `appointments`
  (`migrations/007`). Para los demás roles la única puerta es el RPC
  `delete_duplicate_appointment` (`migrations/080`), que exige que ese mismo
  día exista otra cita viva de la misma persona y que la borrada no tenga
  historia, pagos ni procedimientos pagados. No abras otro camino de borrado;
  lo que no es repetido se cancela.
- **Procedimientos al agendar.** Desde `migrations/080` `secretaria` también
  inserta en `appointment_services`; la barra de cita rápida depende de ello.
  Los motivos sin precio ("Residuos", texto libre) viven en
  `appointments.motivo_consulta`, no en el catálogo de servicios.
- **RLS siempre.** El acceso a datos entra por dos puertas legítimas: los
  helpers de `src/lib/queries/` y las server actions de
  `src/app/(protected)/<módulo>/actions.ts`. Ambas usan el cliente SSR
  (`src/lib/supabase/server.ts`) bajo la sesión del usuario, con RLS aplicando.
  Sigue el patrón del módulo que tocas en lugar de imponer una capa nueva.
- **Service role acotado.** `src/lib/supabase/admin.ts` salta RLS y es solo para
  integraciones de fondo (Outlook, webhooks, índice de nombres). Nunca lo
  importes desde un Client Component ni lo uses para ampliar permisos en una
  ruta de usuario.
- **Datos clínicos reales.** La base contiene pacientes, historias y teléfonos
  reales. No los vuelques en logs, artefactos, issues, scripts de depuración ni
  salidas de herramienta. Al depurar, anonimiza o usa identificadores.
- **Migraciones.** Van en `supabase/migrations/` con numeración consecutiva.
  Créalas y verifícalas localmente; comprueba el plan con `db push --dry-run`,
  pero **pausa antes de aplicarlas** en el proyecto real. El código dependiente
  solo se despliega tras confirmar que el schema ya existe.
- **Validaciones de agenda.** El flujo de estados de cita es regla clínica: no
  lo ajustes por conveniencia técnica. Los topes que menciona el README (máximo
  2 ECOR por día, 3 escleroterapias por pierna) **no están implementados** en
  código ni en el schema; ECOR existe solo como servicio de precio variable. Si
  el usuario los pide, es trabajo nuevo, no una regresión que reparar.
- **`America/Bogota`** en lógica de negocio, cron, almacenamiento y presentación
  cuando corresponda. Los bugs de este proyecto han vivido ahí.
- **Integraciones externas.** El robot de facturación WiMAX
  (`scripts/wimax-facturas/`) y la sincronización con Outlook/Access
  (`scripts/sync-access/`, `src/lib/outlook/`) operan contra sistemas reales de
  terceros. Cambios ahí se prueban en seco antes de correr contra producción.
- Preserva los cambios existentes del usuario. Nunca descartes, sobrescribas ni
  incluyas trabajo ajeno a la tarea.
- No introduzcas una abstracción, dependencia o fallback nuevo sin comprobar
  primero el patrón ya existente y su efecto en otros módulos.
- Los secretos viven en `.env.local` y en Vercel. Inspecciona solo metadata:
  nunca imprimas, copies ni cites un valor.

## Flujo adaptativo

No existe un ritual obligatorio ni se requiere aprobación de un plan para cada
cambio. GSD y `.planning/` están instalados en este repo, pero son opcionales:
úsalos solo si el usuario los pide. No crees `PLAN.md` ni artefactos de
planeación por defecto. Ajusta la profundidad a la ambigüedad, el alcance y el
riesgo.

1. **Entender:** localiza el dueño del comportamiento y sus dependencias reales.
2. **Diagnosticar:** para bugs, reproduce o acota el fallo y encuentra la causa
   raíz antes de editar. Evita acumular parches sobre síntomas.
3. **Evaluar impacto:** revisa consumidores, datos, RLS, migraciones,
   integraciones externas y comportamiento en producción que pueda cambiar.
4. **Planear proporcionalmente:** lista breve para trabajo claro; plan
   persistente solo cuando la coordinación o duración lo justifique.
5. **Implementar:** el cambio mínimo que resuelva la causa de forma coherente,
   siguiendo los patrones existentes.
6. **Verificar:** `npm run type-check`, lint y las pruebas dirigidas que
   correspondan; revisa el diff completo. Amplía según el radio de impacto.
7. **Cerrar:** actualiza solo la fuente de verdad afectada y registra el estado
   y la siguiente acción en el Workboard.

Un fallo durante la verificación no crea otro plan: diagnostica, corrige y
actualiza el mismo objetivo. El plan del trabajo es el contrato del item:
objetivo, alcance, riesgo y criterios `AC-xxx` con su comando. Si un dato es
derivable de Git o de un comando, no lo escribas en prosa.

## Autonomía y cuándo pausar

El agente tiene libertad para leer, investigar, editar archivos locales,
ejecutar pruebas, corregir fallos dentro del alcance y mantener actualizado su
plan sin pedir permiso en cada paso.

Pausa y pide confirmación antes de:

- aplicar una migración contra Supabase real o desplegar código que dependa de ella;
- borrar o transformar datos de pacientes, pagos, citas o historias;
- ejecutar el robot WiMAX o la sincronización Outlook/Access contra sistemas
  reales, o enviar mensajes por Twilio;
- hacer push, merge o deploy a Vercel si el usuario no lo pidió claramente;
- generar cargos, modificar cuentas o credenciales, o enviar comunicaciones a
  pacientes;
- borrar ramas o worktrees, usar `--force`, o resolver una ambigüedad material
  de producto, alcance o datos.

No pauses por elecciones locales reversibles ni para pedir aprobación ritual de
un plan. Si aparece riesgo, agota primero las comprobaciones seguras y presenta
la evidencia concreta junto con la decisión que falta.

Las confirmaciones se interpretan por intención y en lenguaje natural. Una
autorización inequívoca como "confirmo", "sí" o "hazlo" en el contexto inmediato
es suficiente; nunca obligues al usuario a copiar un comando, hash o frase exacta.

## Comandos base

```bash
npm run dev            # desarrollo
npm run type-check     # tsc --noEmit
npm run lint           # eslint (--quiet); lint:all para el detalle
npm run build          # build de producción
npm run test:outlook   # pruebas de la sincronización Outlook
npm run security:audit # npm audit --omit=dev
```

Supabase:

```bash
npx supabase@latest link --project-ref gojqjfuszghfqvdnjjxa
npx supabase@latest db push --dry-run   # comprobar el plan antes de aplicar
```

Workboard (con `WB` exportado, desde el worktree de Varix):

```bash
node $WB/tools/workboard/prepare.mjs  -- --item <id> --mode continue
node $WB/tools/workboard/transfer.mjs -- --from <anterior> --to <siguiente>
node $WB/tools/workboard/handoff.mjs  -- --item <id> --next <paso>
node $WB/tools/workboard/finish.mjs   -- --item <id>
node $WB/tools/workboard/doctor.mjs   -- --report
node $WB/tools/local-preview/cli.mjs  -- --item <id>
```

`prepare.mjs` y `link.mjs` aceptan el contrato v2 —`--goal`, `--risk`,
`--in-scope`, `--out-of-scope` y criterios `AC-xxx` con su comando— que
`finish.mjs` ejecuta al cerrar. Los estados válidos de `--state` son
`active`, `waiting`, `blocked`, `review`, `backlog`, `done`, `archived` y
`superseded`. Consulta `--help` de cada primitiva antes de inventar flags.

## Mapa de divulgación progresiva

De este repo, según lo que toques:

- `docs/SETUP.md`: puesta en marcha, entorno y configuración.
- `docs/ROBOT-FACTURACION-WIMAX.md` y `docs/WIMAX-CLOUD-RDS.md`: robot de
  facturación electrónica y su infraestructura.
- `docs/OUTLOOK-SYNC.md`: sincronización con el PC de recepción.
- `docs/WORKING-FROM-ANOTHER-PC.md`: clon limpio, Vercel, Supabase y acceso al robot.
- `docs/AUDITORIA-Y-MEJORAS-2026-07.md`: hallazgos y mejoras de la rama actual.
- `PROJECT_BRIEF.md` y `.planning/PROJECT.md`: intención del producto.

El comportamiento funcional por módulo no está documentado: vive en
`src/lib/queries/`, `src/app/(protected)/<módulo>/` y `src/components/<módulo>/`.
El `README.md` enlaza `docs/modules/`, `docs/architecture/` y `docs/security/`,
que **no existen** en el árbol; no los busques ni los cites.

Del Workboard, carga solo lo que la tarea exija:

- `$WB/AGENTS.md`: contrato base del tablero; antes de la primera escritura.
- `$WB/docs/agents/worktrees.md`: crear, continuar, delegar o recuperar rama/worktree.
- `$WB/docs/agents/workboard.md`: registrar, transferir, cambiar estado, handoff.
- `$WB/docs/agents/preview.md`: cambio visible o gate autenticado previo a integrar.
- `$WB/docs/agents/proyectos.md`: varias entregas o gates posteriores al código.
- `$WB/docs/agents/integracion.md`: inventario, limpieza, integración, push.
- `$WB/docs/agents/verificacion.md`: elegir checks, producción, commit/handoff.
