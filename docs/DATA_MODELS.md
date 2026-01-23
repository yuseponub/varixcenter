# Modelos de Datos - VarixCenter

## Entidades Principales

### 1. Pacientes

```sql
pacientes {
  id: UUID (PK)
  cedula: VARCHAR UNIQUE NOT NULL
  nombre_completo: VARCHAR NOT NULL
  fecha_nacimiento: DATE
  edad: INTEGER (calculado)
  genero: ENUM('F', 'M')
  estado_civil: VARCHAR
  ocupacion: VARCHAR
  direccion: TEXT
  ciudad: VARCHAR
  telefono: VARCHAR
  celular: VARCHAR
  email: VARCHAR
  publicidad: VARCHAR -- cómo conoció la clínica

  -- Contacto de emergencia
  contacto_emergencia_nombre: VARCHAR
  contacto_emergencia_telefono: VARCHAR
  contacto_emergencia_parentesco: VARCHAR

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

### 2. Historias Clínicas

```sql
historias_clinicas {
  id: UUID (PK)
  paciente_id: UUID (FK -> pacientes)
  fecha: DATE
  medico_id: UUID (FK -> usuarios)

  -- Síntomas (checkboxes)
  sintoma_dolor: BOOLEAN
  sintoma_dolor_ciclo: BOOLEAN
  sintoma_cansancio: BOOLEAN
  sintoma_calambres: BOOLEAN
  sintoma_prurito: BOOLEAN
  sintoma_ardor: BOOLEAN
  sintoma_adormecimiento: BOOLEAN
  sintoma_edema: BOOLEAN
  sintoma_ulcera: BOOLEAN
  sintoma_eczema: BOOLEAN
  sintoma_lipodermatoesclerosis: BOOLEAN

  tiempo_evolucion: VARCHAR -- "6 años", "3 meses", etc

  -- Inicio relacionado (checkboxes)
  inicio_adolescencia: BOOLEAN
  inicio_embarazo: BOOLEAN
  inicio_planificacion: BOOLEAN
  inicio_trauma: BOOLEAN
  inicio_posquirurgico: BOOLEAN

  -- Antecedentes patológicos
  antecedente_familiares: TEXT
  antecedente_ginecologia: VARCHAR -- "G-2", etc
  antecedente_diabetes: BOOLEAN
  antecedente_hipertension: BOOLEAN
  antecedente_hepatitis: BOOLEAN
  antecedente_hospitalizacion: BOOLEAN
  antecedente_cirugia: BOOLEAN
  antecedente_transfuciones: BOOLEAN
  antecedente_alergia: TEXT
  antecedente_farmacologico: TEXT

  -- Hijos/Planificación
  hijos: INTEGER
  planifica: BOOLEAN

  -- Tratamiento anterior
  tratamiento_anterior: TEXT

  -- Enfermedades y alergias
  enfermedades: TEXT
  alergias: TEXT
  cirugias_previas: TEXT -- "CX Estéticas", etc

  observaciones: TEXT

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

### 3. Diagnósticos

```sql
diagnosticos {
  id: UUID (PK)
  paciente_id: UUID (FK -> pacientes)
  historia_clinica_id: UUID (FK -> historias_clinicas)
  fecha: DATE
  medico_id: UUID (FK -> usuarios)

  -- Diagnóstico
  descripcion: TEXT -- "Insuficiencia Venosa Crónica"
  grado: VARCHAR

  -- Hallazgos por miembro
  miembro_inferior_derecho: TEXT
  miembro_inferior_izquierdo: TEXT

  -- Laboratorio vascular indicado
  mapeo_duplex: BOOLEAN
  escaneo_duplex: BOOLEAN
  fotopletismografia: BOOLEAN

  -- Programa terapéutico
  escleroterapia_monoterapia: BOOLEAN
  quirurgico: BOOLEAN
  escleroterapia_laser_superficial: BOOLEAN

  -- Medias indicadas
  presion_media: VARCHAR -- "20-30 mmHg"

  -- Medicamentos
  medicamentos: TEXT -- "Diosmina, Gel Reparil"

  created_at: TIMESTAMP
}
```

### 4. Planes de Tratamiento (Cotizaciones)

```sql
planes_tratamiento {
  id: UUID (PK)
  paciente_id: UUID (FK -> pacientes)
  diagnostico_id: UUID (FK -> diagnosticos)
  fecha: DATE
  medico_id: UUID (FK -> usuarios)

  -- Totales
  total_estimado: DECIMAL
  total_pagado: DECIMAL (calculado de pagos)
  estado: ENUM('pendiente', 'en_progreso', 'completado', 'cancelado')

  -- Descuento (si aplica)
  descuento_porcentaje: DECIMAL
  descuento_monto: DECIMAL
  descuento_autorizado_por: UUID (FK -> usuarios)

  observaciones: TEXT

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

### 5. Items del Plan de Tratamiento

```sql
plan_tratamiento_items {
  id: UUID (PK)
  plan_id: UUID (FK -> planes_tratamiento)

  -- Tipo de item
  tipo: ENUM('ecor', 'escleroterapia', 'laser', 'flebectomia', 'duplex', 'otro')
  descripcion: VARCHAR -- "ECOR Safena Externa", "Sesión escleroterapia"

  -- Ubicación
  miembro: ENUM('derecho', 'izquierdo', 'ambos', 'cara', 'manos')

  -- Cantidad y precio
  cantidad: INTEGER
  precio_unitario: DECIMAL
  subtotal: DECIMAL (calculado)

  -- Estado de ejecución
  cantidad_realizada: INTEGER DEFAULT 0
  estado: ENUM('pendiente', 'en_progreso', 'completado')

  created_at: TIMESTAMP
}
```

### 6. Sesiones/Procedimientos Realizados

```sql
sesiones {
  id: UUID (PK)
  paciente_id: UUID (FK -> pacientes)
  plan_id: UUID (FK -> planes_tratamiento) -- puede ser NULL para pacientes sin plan
  plan_item_id: UUID (FK -> plan_tratamiento_items) -- puede ser NULL

  fecha: DATE
  hora: TIME

  -- Tipo de sesión
  tipo: ENUM('valoracion', 'control', 'scaneo', 'duplex', 'ecor', 'escleroterapia', 'laser', 'flebectomia')
  descripcion: VARCHAR

  -- Ubicación tratada
  miembro: ENUM('derecho', 'izquierdo', 'ambos', 'cara', 'manos')
  zona_especifica: TEXT -- "Safena externa", "Perforante 1", etc

  -- Quién realizó
  medico_id: UUID (FK -> usuarios)

  -- Notas del procedimiento
  notas: TEXT

  -- Referencia al pago
  pago_id: UUID (FK -> pagos)

  created_at: TIMESTAMP
}
```

### 7. Pagos

```sql
pagos {
  id: UUID (PK)
  numero_factura: VARCHAR UNIQUE NOT NULL -- consecutivo automático

  fecha: DATE
  hora: TIME

  paciente_id: UUID (FK -> pacientes)
  plan_id: UUID (FK -> planes_tratamiento) -- puede ser NULL

  -- Concepto
  concepto: VARCHAR -- "Valoración", "2 Sesiones escleroterapia", etc

  -- Montos
  subtotal: DECIMAL
  descuento: DECIMAL DEFAULT 0
  total: DECIMAL

  -- Método de pago
  metodo_pago: ENUM('efectivo', 'tarjeta', 'transferencia', 'nequi')

  -- Fotos obligatorias
  foto_recibo_url: TEXT NOT NULL
  foto_comprobante_url: TEXT -- para tarjeta/transferencia

  -- Quién cobró
  cobrado_por: UUID (FK -> usuarios)

  -- Auditoría - INMUTABLE
  created_at: TIMESTAMP
  -- NO hay updated_at - los pagos no se modifican
}

-- Índice para consecutivo de facturas
CREATE SEQUENCE factura_seq START 39390; -- continuar desde el último
```

### 8. Citas/Agenda

```sql
citas {
  id: UUID (PK)
  paciente_id: UUID (FK -> pacientes)

  fecha: DATE
  hora: TIME
  duracion_minutos: INTEGER DEFAULT 30

  -- Tipo de cita
  tipo: ENUM('valoracion', 'control', 'scaneo', 'duplex', 'procedimiento', 'sesion')
  descripcion: VARCHAR

  -- Asignación
  medico_id: UUID (FK -> usuarios)

  -- Estado
  estado: ENUM('programada', 'confirmada', 'en_atencion', 'atendida', 'no_asistio', 'cancelada')

  -- Notas
  notas: TEXT

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

### 9. Usuarios

```sql
usuarios {
  id: UUID (PK)
  auth_id: UUID (FK -> auth.users de Supabase)

  nombre: VARCHAR NOT NULL
  email: VARCHAR UNIQUE NOT NULL
  rol: ENUM('admin', 'medico', 'enfermera', 'secretaria')
  activo: BOOLEAN DEFAULT true

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

### 10. Permisos

```sql
permisos_usuario {
  id: UUID (PK)
  usuario_id: UUID UNIQUE (FK -> usuarios)

  -- Historias clínicas
  puede_ver_historias: BOOLEAN DEFAULT false
  puede_editar_historias: BOOLEAN DEFAULT false

  -- Pagos
  puede_registrar_pagos: BOOLEAN DEFAULT false
  puede_hacer_descuentos: BOOLEAN DEFAULT false
  puede_anular_pagos: BOOLEAN DEFAULT false

  -- Caja
  puede_ver_caja: BOOLEAN DEFAULT false
  puede_hacer_cierre: BOOLEAN DEFAULT false

  -- Agenda
  puede_ver_agenda: BOOLEAN DEFAULT false
  puede_editar_agenda: BOOLEAN DEFAULT false

  -- Reportes
  puede_ver_reportes: BOOLEAN DEFAULT false

  -- Usuarios
  puede_gestionar_usuarios: BOOLEAN DEFAULT false

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

### 11. Cierre de Caja

```sql
cierres_caja {
  id: UUID (PK)
  fecha: DATE UNIQUE

  -- Totales del sistema
  total_efectivo_sistema: DECIMAL
  total_tarjeta_sistema: DECIMAL
  total_transferencia_sistema: DECIMAL
  total_nequi_sistema: DECIMAL
  total_sistema: DECIMAL (calculado)

  -- Efectivo declarado
  efectivo_declarado: DECIMAL
  diferencia_efectivo: DECIMAL (calculado)

  -- Foto del efectivo
  foto_efectivo_url: TEXT

  -- Quién cerró
  cerrado_por: UUID (FK -> usuarios)

  estado: ENUM('abierto', 'cerrado')
  observaciones: TEXT

  created_at: TIMESTAMP
}
```

### 12. Órdenes de Medias (Integración con Varix)

```sql
ordenes_medias {
  id: UUID (PK)
  paciente_id: UUID (FK -> pacientes)

  fecha_orden: DATE

  -- Medias ordenadas
  tipo_media: ENUM('pantymedia', 'muslo', 'rodilla')
  talla: ENUM('M', 'L', 'XL', 'XXL')
  cantidad: INTEGER DEFAULT 1
  presion: VARCHAR -- "20-30 mmHg"

  -- Estado
  estado: ENUM('pendiente', 'contactado', 'vendido', 'no_compro')

  -- Referencia a Varix Medias (si se vendió)
  venta_varix_id: UUID -- ID en el sistema Varix Medias

  -- Alertas
  dias_sin_comprar: INTEGER (calculado)
  alerta_enviada: BOOLEAN DEFAULT false

  -- Quién ordenó
  ordenado_por: UUID (FK -> usuarios)

  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

### 13. Auditoría

```sql
auditoria {
  id: UUID (PK)

  tabla: VARCHAR -- nombre de la tabla afectada
  registro_id: UUID -- ID del registro afectado
  accion: ENUM('crear', 'modificar', 'eliminar')

  datos_anteriores: JSONB -- snapshot antes del cambio
  datos_nuevos: JSONB -- snapshot después del cambio

  usuario_id: UUID (FK -> usuarios)
  ip_address: VARCHAR

  created_at: TIMESTAMP
}
```

---

## Relaciones

```
pacientes
    │
    ├── historias_clinicas (1:N)
    │       └── diagnosticos (1:N)
    │               └── planes_tratamiento (1:N)
    │                       └── plan_tratamiento_items (1:N)
    │
    ├── sesiones (1:N)
    │
    ├── pagos (1:N)
    │
    ├── citas (1:N)
    │
    └── ordenes_medias (1:N)

usuarios
    │
    ├── permisos_usuario (1:1)
    │
    ├── historias_clinicas.medico_id (1:N)
    ├── diagnosticos.medico_id (1:N)
    ├── sesiones.medico_id (1:N)
    ├── pagos.cobrado_por (1:N)
    ├── citas.medico_id (1:N)
    └── cierres_caja.cerrado_por (1:N)
```

---

## Índices Importantes

```sql
-- Búsqueda de pacientes
CREATE INDEX idx_pacientes_cedula ON pacientes(cedula);
CREATE INDEX idx_pacientes_nombre ON pacientes(nombre_completo);
CREATE INDEX idx_pacientes_celular ON pacientes(celular);

-- Agenda del día
CREATE INDEX idx_citas_fecha ON citas(fecha);
CREATE INDEX idx_citas_medico_fecha ON citas(medico_id, fecha);

-- Pagos del día
CREATE INDEX idx_pagos_fecha ON pagos(fecha);

-- Sesiones del paciente
CREATE INDEX idx_sesiones_paciente ON sesiones(paciente_id);

-- Órdenes de medias pendientes
CREATE INDEX idx_ordenes_medias_estado ON ordenes_medias(estado) WHERE estado = 'pendiente';
```
