# Phase 6: Medical Records - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Historia clinica digital para pacientes de flebologia. Incluye formulario basado en el formato actual de Varix Center, clasificacion CEAP opcional, y generacion automatica de cotizacion desde el plan de tratamiento. El dictado por voz para diagnostico es Fase 7 (separada).

</domain>

<decisions>
## Implementation Decisions

### Estructura del formulario
- Formulario largo continuo con scroll (no tabs ni wizard)
- Secciones basadas en formulario actual de Varix Center:
  1. Datos del paciente (vienen del registro, editables para confirmar)
  2. MC y EA: Sintomas (checkboxes), Tiempo Evolucion (texto libre), Signos
  3. Inicio Relacionado (checkboxes: Adolescencia, Embarazo, etc.)
  4. Antecedentes Patologicos (checkboxes + observaciones)
  5. Diagnostico (texto libre, campo para dictado futuro en Fase 7)
  6. Clasificacion CEAP (C0-C6 por pierna, opcional)
  7. Laboratorio Vascular (checkboxes de estudios)
  8. Programa Terapeutico (tratamientos seleccionados)
  9. Cotizacion (en pestana/seccion separada, accesible)
- **Campos obligatorios:** Solo paciente y medico
- **Resto de campos:** Opcionales

### Clasificacion CEAP
- Solo el componente C (Clinical): C0, C1, C2, C3, C4, C5, C6
- Dropdown simple por pierna (izquierda/derecha)
- Completamente opcional: puede ser una pierna, ambas, o ninguna
- No se requiere E (etiologia), A (anatomia), P (patofisiologia)

### Cotizacion automatica
- Se genera automaticamente desde Programa Terapeutico seleccionado
- Precios vienen del catalogo de servicios existente
- Servicios con precio variable se pueden editar en el momento
- Se muestra en pestana/seccion separada (no en la misma hoja de historia)
- Sin fecha de vencimiento

### Flujo y permisos
- **Origen:** Historia siempre se crea desde una cita existente
- **Estructura:** Una historia base por paciente + notas de evolucion por visita
- **Borrador:** Puede guardarse incompleta y continuar despues
- **Roles de llenado:**
  - Enfermera: Datos generales, sintomas, antecedentes, signos
  - Medico: Diagnostico, clasificacion CEAP, tratamiento, cotizacion
- **Permisos de edicion:**
  - Medicos: Pueden editar TODA la historia (cualquier seccion)
  - Enfermeras: Solo pueden editar secciones de enfermeria (no las del medico)
  - Cualquier medico puede editar historias de cualquier medico
  - Cualquier enfermera puede editar secciones de enfermeria de cualquier historia

### Claude's Discretion
- Diseno visual exacto de los checkboxes y secciones
- Organizacion interna de los campos en cada seccion
- Manejo de notas de evolucion (como se agregan/visualizan)
- Skeleton/loading states

</decisions>

<specifics>
## Specific Ideas

- Formulario basado en el formato fisico actual de Varix Center (imagen de referencia disponible)
- Sintomas con checkboxes: Dolor, Dolor Ciclo, Cansancio, Calambres, Adormecimiento, Prurito, Ardor
- Signos: Lipodermatoesclerosis, Edema, Ulcera, Eczema
- Inicio relacionado: Adolescencia, Embarazo, Planificacion, Trauma, Posquirurgico
- Antecedentes: Familiares, Hepatitis, Hospitalizacion, Ginecologia, Diabetes, Hipertension, Alergia, Cirugia, Transfusiones, Farmacologico
- Laboratorio vascular: Mapeo Dupplex, Escaneo Dupplex, Fotopletismografia
- Tratamientos: Escleroterapia Monoterapia, Quirurgico B, Escleroterapia y Laser Superficial

</specifics>

<deferred>
## Deferred Ideas

- **Dictado por voz para diagnostico** - Fase 7 (Voice Dictation)
  - Campo de diagnostico tendra texto libre en Fase 6
  - Fase 7 agrega boton de dictar que transcribe voz a texto

</deferred>

---

*Phase: 06-medical-records*
*Context gathered: 2026-01-24*
