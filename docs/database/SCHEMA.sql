-- ============================================================================
-- VARIX-CLINIC: Esquema de Base de Datos Completo
-- ============================================================================
-- Sistema de gestión para clínica flebológica VarixCenter
-- PostgreSQL (Supabase)
-- ============================================================================

-- ============================================================================
-- SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS clinic;      -- Datos principales de la clínica
CREATE SCHEMA IF NOT EXISTS audit;       -- Logs de auditoría
CREATE SCHEMA IF NOT EXISTS integration; -- Integración con sistemas externos

-- ============================================================================
-- EXTENSIONES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SCHEMA: CLINIC - Tablas Principales
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla: Usuarios del Sistema
-- ----------------------------------------------------------------------------
CREATE TABLE clinic.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Autenticación (vinculado con Supabase Auth)
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Información personal
  nombre_completo VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  telefono VARCHAR(20),
  documento VARCHAR(20) UNIQUE,
  foto_url TEXT,

  -- Rol y permisos
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('admin', 'medico', 'secretaria', 'enfermera')),
  activo BOOLEAN DEFAULT TRUE,

  -- Firma digital (para médicos)
  firma_url TEXT,
  registro_medico VARCHAR(50), -- Número de registro profesional
  especialidad VARCHAR(100),

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,

  CONSTRAINT email_formato CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_usuarios_rol ON clinic.usuarios(rol);
CREATE INDEX idx_usuarios_activo ON clinic.usuarios(activo) WHERE activo = TRUE;

-- ----------------------------------------------------------------------------
-- Tabla: Pacientes
-- ----------------------------------------------------------------------------
CREATE TABLE clinic.pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Información personal
  tipo_documento VARCHAR(10) NOT NULL CHECK (tipo_documento IN ('CC', 'TI', 'CE', 'PP', 'NIT')),
  documento VARCHAR(20) NOT NULL UNIQUE,
  nombre_completo VARCHAR(200) NOT NULL,
  fecha_nacimiento DATE,
  genero VARCHAR(10) CHECK (genero IN ('masculino', 'femenino', 'otro')),

  -- Contacto
  telefono VARCHAR(20) NOT NULL,
  telefono_secundario VARCHAR(20),
  email VARCHAR(255),

  -- Dirección
  direccion TEXT,
  ciudad VARCHAR(100),
  barrio VARCHAR(100),

  -- Información adicional
  ocupacion VARCHAR(100),
  eps VARCHAR(100), -- Entidad de salud
  foto_url TEXT,

  -- Referido
  referido_por VARCHAR(200), -- Nombre de quien lo refirió
  como_conocio VARCHAR(100), -- Redes, amigo, médico, etc.

  -- Estado
  activo BOOLEAN DEFAULT TRUE,
  notas TEXT,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES clinic.usuarios(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES clinic.usuarios(id)
);

CREATE INDEX idx_pacientes_documento ON clinic.pacientes(documento);
CREATE INDEX idx_pacientes_nombre ON clinic.pacientes(nombre_completo);
CREATE INDEX idx_pacientes_telefono ON clinic.pacientes(telefono);

-- Búsqueda full-text
CREATE INDEX idx_pacientes_busqueda ON clinic.pacientes
  USING gin(to_tsvector('spanish', nombre_completo || ' ' || documento));

-- ----------------------------------------------------------------------------
-- Tabla: Historias Clínicas
-- ----------------------------------------------------------------------------
CREATE TABLE clinic.historias_clinicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES clinic.pacientes(id),

  -- Número de historia (auto-generado)
  numero_historia VARCHAR(20) NOT NULL UNIQUE,

  -- Fecha de apertura
  fecha_apertura DATE NOT NULL DEFAULT CURRENT_DATE,
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),

  -- Motivo de consulta
  motivo_consulta TEXT NOT NULL,

  -- Antecedentes
  antecedentes_personales JSONB DEFAULT '{}',
  -- {
  --   "hipertension": false,
  --   "diabetes": false,
  --   "enfermedades_cardiacas": false,
  --   "trombosis_venosa": false,
  --   "cirugias_previas": [],
  --   "medicamentos_actuales": [],
  --   "alergias": []
  -- }

  antecedentes_familiares JSONB DEFAULT '{}',
  -- {
  --   "varices": false,
  --   "trombosis": false,
  --   "parentesco": ""
  -- }

  -- Hábitos
  habitos JSONB DEFAULT '{}',
  -- {
  --   "tabaquismo": false,
  --   "cigarrillos_dia": 0,
  --   "alcohol": false,
  --   "sedentarismo": false,
  --   "horas_pie_dia": 0,
  --   "anticonceptivos": false
  -- }

  -- Síntomas reportados
  sintomas JSONB DEFAULT '{}',
  -- {
  --   "dolor": { "presente": true, "intensidad": 7, "descripcion": "" },
  --   "pesadez": { "presente": true, "intensidad": 5 },
  --   "calambres": { "presente": false },
  --   "prurito": { "presente": false },
  --   "edema": { "presente": true, "ubicacion": "tobillo" }
  -- }

  -- Examen físico
  examen_fisico JSONB DEFAULT '{}',
  -- {
  --   "pierna_izquierda": {
  --     "varices_visibles": true,
  --     "edema": true,
  --     "cambios_piel": false,
  --     "ulceras": false,
  --     "clasificacion_ceap": "C3"
  --   },
  --   "pierna_derecha": { ... }
  -- }

  -- Mapa corporal (coordenadas de lesiones)
  mapa_corporal JSONB DEFAULT '[]',
  -- [
  --   { "x": 120, "y": 340, "tipo": "variz", "descripcion": "Variz safena mayor", "pierna": "izquierda" },
  --   { "x": 125, "y": 380, "tipo": "telangiectasia", "descripcion": "", "pierna": "izquierda" }
  -- ]

  -- Resultados de Doppler
  doppler JSONB DEFAULT '{}',
  -- {
  --   "fecha": "2024-01-15",
  --   "hallazgos": "Insuficiencia de safena mayor izquierda",
  --   "conclusiones": "",
  --   "archivo_url": ""
  -- }

  -- Diagnóstico
  diagnostico TEXT,
  codigo_cie10 VARCHAR(10), -- Código CIE-10
  clasificacion_ceap VARCHAR(20), -- C0-C6, S, A, P, R

  -- Plan de tratamiento
  plan_tratamiento JSONB DEFAULT '{}',
  -- {
  --   "escleroterapia": {
  --     "requerido": true,
  --     "sesiones_estimadas": 6,
  --     "piernas": ["izquierda", "derecha"]
  --   },
  --   "ecor": {
  --     "requerido": true,
  --     "tipo": "safena_interna",
  --     "lado": "izquierda"
  --   },
  --   "medias_compresion": {
  --     "tipo": "medias_cortas",
  --     "compresion": "20-30",
  --     "talla": "M"
  --   }
  -- }

  -- Seguimiento de tratamiento
  sesiones_escleroterapia_requeridas INTEGER DEFAULT 0,
  sesiones_escleroterapia_completadas INTEGER DEFAULT 0,
  ecor_requerido BOOLEAN DEFAULT FALSE,
  ecor_completado BOOLEAN DEFAULT FALSE,
  fecha_inicio_tratamiento DATE,
  fecha_fin_tratamiento DATE,

  -- Estado
  estado VARCHAR(20) NOT NULL DEFAULT 'activa' CHECK (estado IN (
    'activa', 'en_tratamiento', 'finalizada', 'abandonada'
  )),

  -- Notas y observaciones (dictado por voz)
  notas_evolucion TEXT,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historias_paciente ON clinic.historias_clinicas(paciente_id);
CREATE INDEX idx_historias_medico ON clinic.historias_clinicas(medico_id);
CREATE INDEX idx_historias_estado ON clinic.historias_clinicas(estado);
CREATE INDEX idx_historias_numero ON clinic.historias_clinicas(numero_historia);

-- Trigger: Generar número de historia automáticamente
CREATE OR REPLACE FUNCTION clinic.generar_numero_historia()
RETURNS TRIGGER AS $$
DECLARE
  año VARCHAR(4);
  secuencia INTEGER;
BEGIN
  año := TO_CHAR(CURRENT_DATE, 'YYYY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(numero_historia FROM 6) AS INTEGER)), 0) + 1
  INTO secuencia
  FROM clinic.historias_clinicas
  WHERE numero_historia LIKE 'HC-' || año || '-%';

  NEW.numero_historia := 'HC-' || año || '-' || LPAD(secuencia::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generar_numero_historia
  BEFORE INSERT ON clinic.historias_clinicas
  FOR EACH ROW
  WHEN (NEW.numero_historia IS NULL)
  EXECUTE FUNCTION clinic.generar_numero_historia();

-- ----------------------------------------------------------------------------
-- Tabla: Evoluciones (Notas de seguimiento)
-- ----------------------------------------------------------------------------
CREATE TABLE clinic.evoluciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  historia_id UUID NOT NULL REFERENCES clinic.historias_clinicas(id),

  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),

  -- Tipo de consulta
  tipo_consulta VARCHAR(30) NOT NULL CHECK (tipo_consulta IN (
    'valoracion', 'control', 'escleroterapia', 'ecor', 'emergencia'
  )),

  -- Contenido
  subjetivo TEXT, -- Lo que refiere el paciente
  objetivo TEXT, -- Hallazgos del examen
  analisis TEXT, -- Interpretación médica
  plan TEXT, -- Plan a seguir

  -- Para escleroterapia
  escleroterapia_detalle JSONB DEFAULT '{}',
  -- {
  --   "pierna": "izquierda",
  --   "sesion_numero": 3,
  --   "sustancia": "polidocanol",
  --   "concentracion": "0.5%",
  --   "volumen_ml": 2,
  --   "zonas_tratadas": ["muslo interno", "pantorrilla"],
  --   "complicaciones": null
  -- }

  -- Para ECOR
  ecor_detalle JSONB DEFAULT '{}',
  -- {
  --   "tipo_procedimiento": "safena_interna",
  --   "lado": "izquierda",
  --   "energia_joules": 1200,
  --   "longitud_tratada_cm": 35,
  --   "complicaciones": null,
  --   "anestesia": "local"
  -- }

  -- Archivos adjuntos (fotos, doppler, etc.)
  archivos JSONB DEFAULT '[]',

  -- Grabación de voz (URL del audio)
  audio_url TEXT,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES clinic.usuarios(id)
);

CREATE INDEX idx_evoluciones_historia ON clinic.evoluciones(historia_id);
CREATE INDEX idx_evoluciones_fecha ON clinic.evoluciones(fecha);
CREATE INDEX idx_evoluciones_medico ON clinic.evoluciones(medico_id);

-- ----------------------------------------------------------------------------
-- Tabla: Citas
-- ----------------------------------------------------------------------------
CREATE TABLE clinic.citas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES clinic.pacientes(id),
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),

  -- Programación
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  tipo_cita VARCHAR(20) NOT NULL CHECK (tipo_cita IN (
    'valoracion', 'control', 'escleroterapia',
    'scaneo', 'duplex', 'ecor'
  )),

  -- Para escleroterapia
  pierna VARCHAR(10) CHECK (pierna IN ('izquierda', 'derecha', 'ambas')),
  sesion_numero INTEGER,

  -- Estado
  estado VARCHAR(20) NOT NULL DEFAULT 'programada' CHECK (estado IN (
    'programada', 'confirmada', 'en_sala',
    'en_atencion', 'completada', 'no_asistio', 'cancelada'
  )),

  -- Información adicional
  motivo TEXT,
  notas_internas TEXT,
  recordatorio_enviado BOOLEAN DEFAULT FALSE,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES clinic.usuarios(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES clinic.usuarios(id),

  CONSTRAINT cita_hora_valida CHECK (hora_fin > hora_inicio)
);

CREATE INDEX idx_citas_fecha_medico ON clinic.citas(fecha, medico_id);
CREATE INDEX idx_citas_paciente ON clinic.citas(paciente_id);
CREATE INDEX idx_citas_estado ON clinic.citas(estado);

-- Trigger: Validar límite de ECOR (máximo 2 por día)
CREATE OR REPLACE FUNCTION clinic.validar_limite_ecor()
RETURNS TRIGGER AS $$
DECLARE
  ecor_count INTEGER;
BEGIN
  IF NEW.tipo_cita = 'ecor' AND NEW.estado NOT IN ('cancelada', 'no_asistio') THEN
    SELECT COUNT(*) INTO ecor_count
    FROM clinic.citas
    WHERE fecha = NEW.fecha
      AND tipo_cita = 'ecor'
      AND estado NOT IN ('cancelada', 'no_asistio')
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

    IF ecor_count >= 2 THEN
      RAISE EXCEPTION 'Máximo 2 procedimientos ECOR por día. Ya hay % programados.', ecor_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_limite_ecor
  BEFORE INSERT OR UPDATE ON clinic.citas
  FOR EACH ROW
  EXECUTE FUNCTION clinic.validar_limite_ecor();

-- Trigger: Validar límite de escleroterapia (máximo 3 por pierna por día)
CREATE OR REPLACE FUNCTION clinic.validar_limite_escleroterapia()
RETURNS TRIGGER AS $$
DECLARE
  escl_count_izq INTEGER;
  escl_count_der INTEGER;
BEGIN
  IF NEW.tipo_cita = 'escleroterapia' AND NEW.estado NOT IN ('cancelada', 'no_asistio') THEN
    SELECT
      COUNT(*) FILTER (WHERE pierna IN ('izquierda', 'ambas')),
      COUNT(*) FILTER (WHERE pierna IN ('derecha', 'ambas'))
    INTO escl_count_izq, escl_count_der
    FROM clinic.citas
    WHERE fecha = NEW.fecha
      AND paciente_id = NEW.paciente_id
      AND tipo_cita = 'escleroterapia'
      AND estado NOT IN ('cancelada', 'no_asistio')
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

    IF NEW.pierna IN ('izquierda', 'ambas') AND escl_count_izq >= 3 THEN
      RAISE EXCEPTION 'Máximo 3 sesiones de escleroterapia por pierna izquierda por día.';
    END IF;

    IF NEW.pierna IN ('derecha', 'ambas') AND escl_count_der >= 3 THEN
      RAISE EXCEPTION 'Máximo 3 sesiones de escleroterapia por pierna derecha por día.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_limite_escleroterapia
  BEFORE INSERT OR UPDATE ON clinic.citas
  FOR EACH ROW
  EXECUTE FUNCTION clinic.validar_limite_escleroterapia();

-- ----------------------------------------------------------------------------
-- Tabla: Bloqueos de Agenda
-- ----------------------------------------------------------------------------
CREATE TABLE clinic.bloqueos_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  hora_inicio TIME,
  hora_fin TIME,
  motivo VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES clinic.usuarios(id)
);

-- ----------------------------------------------------------------------------
-- Tabla: Pagos (INMUTABLE - Solo anulación permitida)
-- ----------------------------------------------------------------------------
CREATE TABLE clinic.pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Número de recibo (auto-generado, nunca reutilizado)
  numero_recibo VARCHAR(20) NOT NULL UNIQUE,

  -- Referencias
  paciente_id UUID NOT NULL REFERENCES clinic.pacientes(id),
  cita_id UUID REFERENCES clinic.citas(id),

  -- Información del pago
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concepto VARCHAR(100) NOT NULL,
  descripcion TEXT,
  monto DECIMAL(12,2) NOT NULL CHECK (monto > 0),

  -- Método de pago
  metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN (
    'efectivo', 'tarjeta', 'transferencia'
  )),

  -- Comprobante (OBLIGATORIO)
  foto_comprobante_url TEXT NOT NULL,

  -- Para tarjeta
  ultimos_digitos VARCHAR(4),
  franquicia VARCHAR(20), -- Visa, Mastercard, etc.

  -- Para transferencia
  numero_transaccion VARCHAR(50),
  banco_origen VARCHAR(50),

  -- Estado (solo puede cambiar de 'activo' a 'anulado')
  estado VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),

  -- Información de anulación
  anulado_at TIMESTAMPTZ,
  anulado_por UUID REFERENCES clinic.usuarios(id),
  motivo_anulacion TEXT,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES clinic.usuarios(id)
);

CREATE INDEX idx_pagos_paciente ON clinic.pagos(paciente_id);
CREATE INDEX idx_pagos_fecha ON clinic.pagos(fecha);
CREATE INDEX idx_pagos_estado ON clinic.pagos(estado);
CREATE INDEX idx_pagos_numero_recibo ON clinic.pagos(numero_recibo);

-- Trigger: Generar número de recibo
CREATE OR REPLACE FUNCTION clinic.generar_numero_recibo()
RETURNS TRIGGER AS $$
DECLARE
  año VARCHAR(4);
  secuencia INTEGER;
BEGIN
  año := TO_CHAR(NEW.fecha, 'YYYY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(numero_recibo FROM 4) AS INTEGER)), 0) + 1
  INTO secuencia
  FROM clinic.pagos
  WHERE numero_recibo LIKE año || '-%';

  NEW.numero_recibo := año || '-' || LPAD(secuencia::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generar_numero_recibo
  BEFORE INSERT ON clinic.pagos
  FOR EACH ROW
  WHEN (NEW.numero_recibo IS NULL)
  EXECUTE FUNCTION clinic.generar_numero_recibo();

-- Trigger: PREVENIR MODIFICACIÓN de pagos (solo anulación)
CREATE OR REPLACE FUNCTION clinic.prevent_pago_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo permitir cambio de estado a 'anulado'
  IF OLD.estado = 'activo' AND NEW.estado = 'anulado' THEN
    -- Verificar que se proporcione motivo
    IF NEW.motivo_anulacion IS NULL OR NEW.motivo_anulacion = '' THEN
      RAISE EXCEPTION 'Se requiere motivo para anular un pago';
    END IF;

    -- Establecer fecha de anulación
    NEW.anulado_at := NOW();
    RETURN NEW;
  END IF;

  -- Cualquier otra modificación está prohibida
  RAISE EXCEPTION 'Los pagos no pueden ser modificados. Solo se pueden anular.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_pago_update
  BEFORE UPDATE ON clinic.pagos
  FOR EACH ROW
  EXECUTE FUNCTION clinic.prevent_pago_update();

-- Trigger: PREVENIR ELIMINACIÓN de pagos
CREATE OR REPLACE FUNCTION clinic.prevent_pago_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Los pagos no pueden ser eliminados. Use anulación en su lugar.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_pago_delete
  BEFORE DELETE ON clinic.pagos
  FOR EACH ROW
  EXECUTE FUNCTION clinic.prevent_pago_delete();

-- ----------------------------------------------------------------------------
-- Tabla: Cajas (Cierre diario)
-- ----------------------------------------------------------------------------
CREATE TABLE clinic.cajas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL UNIQUE,

  -- Apertura
  base_inicial DECIMAL(12,2) NOT NULL DEFAULT 0,
  apertura_foto_url TEXT,
  apertura_hora TIMESTAMPTZ,
  apertura_por UUID REFERENCES clinic.usuarios(id),

  -- Totales calculados
  total_efectivo DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_tarjeta DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_transferencia DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_anulaciones DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Cierre
  efectivo_contado DECIMAL(12,2),
  diferencia DECIMAL(12,2),
  justificacion_diferencia TEXT,
  cierre_foto_url TEXT,
  cierre_hora TIMESTAMPTZ,
  cierre_por UUID REFERENCES clinic.usuarios(id),

  -- Estado
  estado VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (estado IN (
    'abierta', 'en_cierre', 'cerrada'
  )),

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_cajas_fecha ON clinic.cajas(fecha);

-- Trigger: Actualizar totales de caja cuando se registra un pago
CREATE OR REPLACE FUNCTION clinic.actualizar_totales_caja()
RETURNS TRIGGER AS $$
DECLARE
  pago_fecha DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    pago_fecha := OLD.fecha::DATE;
  ELSE
    pago_fecha := NEW.fecha::DATE;
  END IF;

  -- Crear caja si no existe
  INSERT INTO clinic.cajas (fecha)
  VALUES (pago_fecha)
  ON CONFLICT (fecha) DO NOTHING;

  -- Recalcular totales
  UPDATE clinic.cajas
  SET
    total_efectivo = COALESCE((
      SELECT SUM(monto) FROM clinic.pagos
      WHERE fecha::DATE = pago_fecha AND metodo_pago = 'efectivo' AND estado = 'activo'
    ), 0),
    total_tarjeta = COALESCE((
      SELECT SUM(monto) FROM clinic.pagos
      WHERE fecha::DATE = pago_fecha AND metodo_pago = 'tarjeta' AND estado = 'activo'
    ), 0),
    total_transferencia = COALESCE((
      SELECT SUM(monto) FROM clinic.pagos
      WHERE fecha::DATE = pago_fecha AND metodo_pago = 'transferencia' AND estado = 'activo'
    ), 0),
    total_anulaciones = COALESCE((
      SELECT SUM(monto) FROM clinic.pagos
      WHERE fecha::DATE = pago_fecha AND estado = 'anulado'
    ), 0),
    updated_at = NOW()
  WHERE fecha = pago_fecha;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_totales_caja
  AFTER INSERT OR UPDATE OR DELETE ON clinic.pagos
  FOR EACH ROW
  EXECUTE FUNCTION clinic.actualizar_totales_caja();

-- ============================================================================
-- SCHEMA: INTEGRATION - Integración con Varix Medias
-- ============================================================================

CREATE TABLE integration.ordenes_medias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referencias
  paciente_id UUID NOT NULL REFERENCES clinic.pacientes(id),
  historia_id UUID REFERENCES clinic.historias_clinicas(id),
  medico_id UUID NOT NULL REFERENCES clinic.usuarios(id),

  -- Prescripción
  fecha_prescripcion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo_media VARCHAR(50) NOT NULL,
  compresion VARCHAR(20) NOT NULL,
  talla VARCHAR(10) NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  color VARCHAR(30),
  notas TEXT,

  -- Estado
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente', 'notificada', 'en_proceso', 'completada', 'cancelada'
  )),

  -- Tracking desde varix-medias
  varix_pedido_id UUID,
  fecha_compra TIMESTAMPTZ,
  monto_venta DECIMAL(12,2),

  -- Alertas
  ultima_alerta TIMESTAMPTZ,
  alertas_enviadas INTEGER DEFAULT 0,

  -- Auditoría
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ordenes_medias_paciente ON integration.ordenes_medias(paciente_id);
CREATE INDEX idx_ordenes_medias_estado ON integration.ordenes_medias(estado);

-- Log de sincronización
CREATE TABLE integration.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origen VARCHAR(20) NOT NULL,
  destino VARCHAR(20) NOT NULL,
  tipo_evento VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  error_mensaje TEXT,
  reintentos INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_log_pendiente ON integration.sync_log(estado, created_at)
  WHERE estado = 'pendiente';

-- ============================================================================
-- SCHEMA: AUDIT - Sistema de Auditoría
-- ============================================================================

CREATE TABLE audit.log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Información del cambio
  tabla VARCHAR(100) NOT NULL,
  registro_id UUID NOT NULL,
  accion VARCHAR(20) NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'CIERRE')),

  -- Datos
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  campos_modificados TEXT[],

  -- Usuario y sesión
  usuario_id UUID REFERENCES clinic.usuarios(id),
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_tabla ON audit.log(tabla, registro_id);
CREATE INDEX idx_audit_log_usuario ON audit.log(usuario_id);
CREATE INDEX idx_audit_log_fecha ON audit.log(created_at);

-- Función genérica de auditoría
CREATE OR REPLACE FUNCTION audit.log_changes()
RETURNS TRIGGER AS $$
DECLARE
  cambios TEXT[];
  old_data JSONB;
  new_data JSONB;
  key_name TEXT;
BEGIN
  -- Determinar datos según operación
  IF TG_OP = 'DELETE' THEN
    old_data := to_jsonb(OLD);
    new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    old_data := NULL;
    new_data := to_jsonb(NEW);
  ELSE -- UPDATE
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);

    -- Encontrar campos modificados
    FOR key_name IN SELECT jsonb_object_keys(new_data)
    LOOP
      IF old_data->key_name IS DISTINCT FROM new_data->key_name THEN
        cambios := array_append(cambios, key_name);
      END IF;
    END LOOP;
  END IF;

  -- Insertar log
  INSERT INTO audit.log (
    tabla,
    registro_id,
    accion,
    datos_anteriores,
    datos_nuevos,
    campos_modificados,
    usuario_id
  ) VALUES (
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    old_data,
    new_data,
    cambios,
    COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Aplicar auditoría a tablas críticas
CREATE TRIGGER audit_pacientes
  AFTER INSERT OR UPDATE OR DELETE ON clinic.pacientes
  FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

CREATE TRIGGER audit_historias
  AFTER INSERT OR UPDATE OR DELETE ON clinic.historias_clinicas
  FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

CREATE TRIGGER audit_pagos
  AFTER INSERT OR UPDATE ON clinic.pagos
  FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

CREATE TRIGGER audit_citas
  AFTER INSERT OR UPDATE OR DELETE ON clinic.citas
  FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

CREATE TRIGGER audit_cajas
  AFTER INSERT OR UPDATE ON clinic.cajas
  FOR EACH ROW EXECUTE FUNCTION audit.log_changes();

-- ============================================================================
-- VISTAS MATERIALIZADAS PARA REPORTES
-- ============================================================================

-- Resumen financiero diario
CREATE MATERIALIZED VIEW clinic.mv_resumen_financiero_diario AS
SELECT
  DATE(p.fecha) AS fecha,
  COUNT(*) AS total_pagos,
  COUNT(*) FILTER (WHERE p.estado = 'anulado') AS pagos_anulados,
  SUM(p.monto) FILTER (WHERE p.estado = 'activo') AS ingresos_totales,
  SUM(p.monto) FILTER (WHERE p.estado = 'activo' AND p.metodo_pago = 'efectivo') AS efectivo,
  SUM(p.monto) FILTER (WHERE p.estado = 'activo' AND p.metodo_pago = 'tarjeta') AS tarjeta,
  SUM(p.monto) FILTER (WHERE p.estado = 'activo' AND p.metodo_pago = 'transferencia') AS transferencia,
  SUM(p.monto) FILTER (WHERE p.estado = 'anulado') AS monto_anulado
FROM clinic.pagos p
GROUP BY DATE(p.fecha)
ORDER BY fecha DESC;

CREATE UNIQUE INDEX idx_mv_resumen_financiero_fecha ON clinic.mv_resumen_financiero_diario(fecha);

-- Productividad por médico
CREATE MATERIALIZED VIEW clinic.mv_productividad_medico AS
SELECT
  u.id AS medico_id,
  u.nombre_completo AS medico,
  DATE_TRUNC('month', c.fecha) AS mes,
  COUNT(*) AS total_citas,
  COUNT(*) FILTER (WHERE c.estado = 'completada') AS citas_completadas,
  COUNT(*) FILTER (WHERE c.estado = 'no_asistio') AS no_shows,
  COUNT(*) FILTER (WHERE c.tipo_cita = 'valoracion') AS valoraciones,
  COUNT(*) FILTER (WHERE c.tipo_cita = 'escleroterapia') AS escleroterapias,
  COUNT(*) FILTER (WHERE c.tipo_cita = 'ecor') AS ecors,
  ROUND(
    COUNT(*) FILTER (WHERE c.estado = 'no_asistio')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS tasa_no_show
FROM clinic.usuarios u
LEFT JOIN clinic.citas c ON c.medico_id = u.id
WHERE u.rol = 'medico'
GROUP BY u.id, u.nombre_completo, DATE_TRUNC('month', c.fecha);

CREATE INDEX idx_mv_productividad_mes ON clinic.mv_productividad_medico(mes);

-- Función para refrescar vistas
CREATE OR REPLACE FUNCTION clinic.refrescar_vistas_reportes()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY clinic.mv_resumen_financiero_diario;
  REFRESH MATERIALIZED VIEW CONCURRENTLY clinic.mv_productividad_medico;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VISTA: Alertas de Seguridad
-- ============================================================================

CREATE OR REPLACE VIEW clinic.v_alertas_seguridad AS
-- Anulaciones frecuentes
SELECT
  'anulacion_frecuente' AS tipo_alerta,
  u.id AS usuario_id,
  u.nombre_completo AS usuario,
  COUNT(*)::INTEGER AS cantidad,
  'Usuario con muchas anulaciones este mes' AS descripcion,
  MAX(p.anulado_at) AS ultima_ocurrencia
FROM clinic.pagos p
JOIN clinic.usuarios u ON u.id = p.anulado_por
WHERE p.estado = 'anulado'
  AND p.anulado_at > DATE_TRUNC('month', CURRENT_DATE)
GROUP BY u.id, u.nombre_completo
HAVING COUNT(*) > 5

UNION ALL

-- Diferencias de caja significativas
SELECT
  'diferencia_caja' AS tipo_alerta,
  c.cierre_por AS usuario_id,
  u.nombre_completo AS usuario,
  ABS(c.diferencia)::INTEGER AS cantidad,
  'Diferencia significativa en cierre de caja' AS descripcion,
  c.cierre_hora AS ultima_ocurrencia
FROM clinic.cajas c
JOIN clinic.usuarios u ON u.id = c.cierre_por
WHERE c.estado = 'cerrada'
  AND ABS(c.diferencia) > 50000
  AND c.fecha > CURRENT_DATE - INTERVAL '30 days';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS en tablas sensibles
ALTER TABLE clinic.pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.historias_clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic.cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.log ENABLE ROW LEVEL SECURITY;

-- Políticas para pacientes
CREATE POLICY "Usuarios autenticados pueden ver pacientes"
  ON clinic.pacientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar pacientes"
  ON clinic.pacientes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar pacientes"
  ON clinic.pacientes FOR UPDATE
  TO authenticated
  USING (true);

-- Políticas para pagos (más restrictivas)
CREATE POLICY "Ver pagos"
  ON clinic.pagos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Registrar pagos"
  ON clinic.pagos FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Solo admins pueden "actualizar" pagos (anular)
CREATE POLICY "Anular pagos solo admin"
  ON clinic.pagos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clinic.usuarios
      WHERE auth_user_id = auth.uid()
      AND rol = 'admin'
    )
  );

-- Políticas para auditoría (solo lectura para admins)
CREATE POLICY "Solo admins ven auditoría"
  ON audit.log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clinic.usuarios
      WHERE auth_user_id = auth.uid()
      AND rol = 'admin'
    )
  );

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================

-- Insertar usuario administrador inicial
-- (Se debe hacer después de crear el usuario en Supabase Auth)

-- INSERT INTO clinic.usuarios (
--   auth_user_id,
--   nombre_completo,
--   email,
--   rol
-- ) VALUES (
--   'UUID-DEL-USUARIO-AUTH',
--   'Administrador',
--   'admin@varixcenter.com',
--   'admin'
-- );

-- ============================================================================
-- FIN DEL ESQUEMA
-- ============================================================================
