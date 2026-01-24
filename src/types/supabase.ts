/**
 * Supabase Database Types
 *
 * These types will be auto-generated after creating the database schema.
 * Run the following command to regenerate:
 *
 * npx supabase gen types typescript --project-id <project-id> > src/types/supabase.ts
 *
 * For local development:
 * npx supabase gen types typescript --local > src/types/supabase.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * Database schema types - placeholder until schema is created.
 * Will be replaced by generated types from Supabase CLI.
 */
export interface Database {
  public: {
    Tables: {
      audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string
          action: string
          old_data: Json | null
          new_data: Json | null
          changed_fields: string[] | null
          changed_by: string | null
          changed_at: string
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          action: string
          old_data?: Json | null
          new_data?: Json | null
          changed_fields?: string[] | null
          changed_by?: string | null
          changed_at?: string
        }
        Update: {
          // audit_log is immutable - no UPDATE allowed
        }
        Relationships: []
      }
      patients: {
        Row: {
          id: string
          cedula: string
          nombre: string
          apellido: string
          celular: string
          email: string | null
          fecha_nacimiento: string | null
          direccion: string | null
          contacto_emergencia_nombre: string
          contacto_emergencia_telefono: string
          contacto_emergencia_parentesco: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cedula: string
          nombre: string
          apellido: string
          celular: string
          email?: string | null
          fecha_nacimiento?: string | null
          direccion?: string | null
          contacto_emergencia_nombre: string
          contacto_emergencia_telefono: string
          contacto_emergencia_parentesco: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          // cedula intentionally omitted - immutable
          nombre?: string
          apellido?: string
          celular?: string
          email?: string | null
          fecha_nacimiento?: string | null
          direccion?: string | null
          contacto_emergencia_nombre?: string
          contacto_emergencia_telefono?: string
          contacto_emergencia_parentesco?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      appointments: {
        Row: {
          id: string
          patient_id: string
          doctor_id: string
          fecha_hora_inicio: string
          fecha_hora_fin: string
          estado: 'programada' | 'confirmada' | 'en_sala' | 'en_atencion' | 'completada' | 'cancelada' | 'no_asistio'
          notas: string | null
          motivo_consulta: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          doctor_id: string
          fecha_hora_inicio: string
          fecha_hora_fin: string
          estado?: 'programada' | 'confirmada' | 'en_sala' | 'en_atencion' | 'completada' | 'cancelada' | 'no_asistio'
          notas?: string | null
          motivo_consulta?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          doctor_id?: string
          fecha_hora_inicio?: string
          fecha_hora_fin?: string
          estado?: 'programada' | 'confirmada' | 'en_sala' | 'en_atencion' | 'completada' | 'cancelada' | 'no_asistio'
          notas?: string | null
          motivo_consulta?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      services: {
        Row: {
          id: string
          nombre: string
          descripcion: string | null
          precio_base: number
          precio_variable: boolean
          precio_minimo: number | null
          precio_maximo: number | null
          activo: boolean
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          nombre: string
          descripcion?: string | null
          precio_base: number
          precio_variable?: boolean
          precio_minimo?: number | null
          precio_maximo?: number | null
          activo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          descripcion?: string | null
          precio_base?: number
          precio_variable?: boolean
          precio_minimo?: number | null
          precio_maximo?: number | null
          activo?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      payments: {
        Row: {
          id: string
          patient_id: string
          numero_factura: string
          subtotal: number
          descuento: number
          descuento_justificacion: string | null
          total: number
          estado: 'activo' | 'anulado'
          anulado_por: string | null
          anulado_at: string | null
          anulacion_justificacion: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          numero_factura: string
          subtotal: number
          descuento?: number
          descuento_justificacion?: string | null
          total: number
          estado?: 'activo' | 'anulado'
          anulado_por?: string | null
          anulado_at?: string | null
          anulacion_justificacion?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          // payments are immutable - updates are restricted by RLS
        }
        Relationships: [
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      payment_items: {
        Row: {
          id: string
          payment_id: string
          service_id: string
          service_name: string
          unit_price: number
          quantity: number
          subtotal: number
          created_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          service_id: string
          service_name: string
          unit_price: number
          quantity: number
          subtotal: number
          created_at?: string
        }
        Update: {
          // payment_items are immutable - no UPDATE allowed
        }
        Relationships: [
          {
            foreignKeyName: "payment_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          }
        ]
      }
      payment_methods: {
        Row: {
          id: string
          payment_id: string
          metodo: 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi'
          monto: number
          comprobante_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          metodo: 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi'
          monto: number
          comprobante_path?: string | null
          created_at?: string
        }
        Update: {
          // payment_methods are immutable - no UPDATE allowed
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          }
        ]
      }
      invoice_counter: {
        Row: {
          id: number
          current_number: number
          updated_at: string
        }
        Insert: {
          id?: number
          current_number?: number
          updated_at?: string
        }
        Update: {
          id?: number
          current_number?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      doctors_view: {
        Row: {
          id: string
          email: string
          nombre: string
          apellido: string
        }
        Relationships: []
      }
    }
    Functions: {
      // Functions will be generated
    }
    Enums: {
      user_role: 'admin' | 'medico' | 'enfermera' | 'secretaria'
      appointment_status: 'programada' | 'confirmada' | 'en_sala' | 'en_atencion' | 'completada' | 'cancelada' | 'no_asistio'
      payment_status: 'activo' | 'anulado'
      payment_method_type: 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi'
    }
    CompositeTypes: {
      // Composite types will be generated
    }
  }
}
