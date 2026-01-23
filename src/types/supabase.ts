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
    }
    Views: {
      // Views will be generated
    }
    Functions: {
      // Functions will be generated
    }
    Enums: {
      user_role: 'admin' | 'medico' | 'enfermera' | 'secretaria'
    }
    CompositeTypes: {
      // Composite types will be generated
    }
  }
}
