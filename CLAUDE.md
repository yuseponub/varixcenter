@AGENTS.md

# Varix Clinic — diferencias para Claude Code

`AGENTS.md`, importado arriba, es el contrato operativo: contexto, Workboard,
invariantes, fronteras humanas y mapa de divulgación progresiva. Aquí solo va lo
que cambia por ser Claude Code.

- Usa `CLAUDE_CODE_SESSION_ID` como identidad canónica al registrar un item;
  nunca inventes ni reutilices el ID de otra sesión. Confirma que el registro
  reporte al menos una rama y una instancia antes de la primera edición.
- Los worktrees nativos del harness no reemplazan `prepare.mjs`. Si el harness
  crea uno, debe corresponder a la rama y ruta que resolvió el Workboard.
- Una instancia pertenece a un solo item. Para pasar a otro trabajo, transfiere
  la sesión con `--transfer-from` en `prepare` o con `transfer.mjs`; no abras una
  segunda tarjeta para la misma conversación.
- Claude no emite una señal de fin de turno equivalente a Codex: el Workboard
  deriva vida desde mtime. Heartbeat no es progreso semántico; el estado y la
  siguiente acción los registras tú.
- Trabaja con autonomía local: investiga, edita, prueba y corrige sin aprobación
  paso a paso. No exijas `PLAN.md` ni aprobación ritual para tocar código.
- GSD está instalado en `.claude/` y `.planning/` guarda el historial de los 15
  fases de v1.0/v1.1. Es memoria del proyecto, no una puerta de aprobación: los
  comandos `/gsd:*` se usan solo si el usuario los pide, y sus afirmaciones se
  verifican contra el código vigente antes de confiar en ellas.
- Revisa `git status`, commits pendientes y el diff completo; agrega rutas
  explícitas al hacer commit. La rama de trabajo es `mejoras-2026-07`.
- Al depurar contra datos reales, no dejes que nombres, documentos, teléfonos ni
  historias de pacientes lleguen a la salida de las herramientas o al transcript.
- Actualiza la fuente de verdad afectada solo cuando el cambio altere contratos,
  arquitectura, operación o el estado real de una feature.
