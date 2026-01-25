---
status: testing
phase: 02-patients
source: [02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-06-SUMMARY.md, 02-07-SUMMARY.md]
started: 2026-01-23T22:30:00Z
updated: 2026-01-23T22:30:00Z
---

## Current Test

number: 1
name: Registrar nuevo paciente
expected: |
  Navegar a /pacientes/nuevo. Llenar el formulario con datos válidos (cédula 6-10 dígitos, celular 10 dígitos, contacto de emergencia obligatorio). Al enviar, redirige a /pacientes/[id] mostrando el paciente creado.
awaiting: user response

## Tests

### 1. Registrar nuevo paciente
expected: Navegar a /pacientes/nuevo. Llenar el formulario con datos válidos. Al enviar, redirige a la página de detalle del paciente creado.
result: [pending]

### 2. Validación de cédula inválida
expected: En /pacientes/nuevo, ingresar cédula con menos de 6 dígitos o más de 10. El formulario muestra error en español: "La cedula debe tener entre 6 y 10 digitos"
result: [pending]

### 3. Cédula duplicada
expected: Intentar registrar un paciente con una cédula que ya existe. Muestra error: "Ya existe un paciente con esta cedula"
result: [pending]

### 4. Cédula inmutable en edición
expected: En /pacientes/[id]/editar, el campo cédula está deshabilitado (gris) con texto "La cedula no puede ser modificada"
result: [pending]

### 5. Búsqueda de pacientes
expected: En /pacientes, escribir parte de un nombre, cédula o celular. La lista se filtra mostrando coincidencias parciales (debounce ~300ms)
result: [pending]

### 6. Navegación desde tabla
expected: En /pacientes, hacer clic en una fila de la tabla. Navega a /pacientes/[id] mostrando el detalle del paciente
result: [pending]

### 7. Perfil de paciente completo
expected: En /pacientes/[id], ver información personal, contacto de emergencia, y fechas de registro/actualización formateadas en español
result: [pending]

### 8. Timeline vacío
expected: En /pacientes/[id], la sección "Historial de Actividad" muestra: "No hay eventos registrados" y "Los pagos, citas y procedimientos apareceran aqui"
result: [pending]

### 9. Botón editar en detalle
expected: En /pacientes/[id], hacer clic en "Editar Paciente". Navega a /pacientes/[id]/editar con los datos precargados
result: [pending]

### 10. Contacto de emergencia requerido
expected: En /pacientes/nuevo, dejar vacíos los campos de contacto de emergencia. El formulario muestra errores de validación en español
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0

## Gaps

[none yet]
