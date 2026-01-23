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
      // Tables will be generated after schema creation
      // Example structure:
      // patients: {
      //   Row: { id: string; name: string; ... }
      //   Insert: { id?: string; name: string; ... }
      //   Update: { id?: string; name?: string; ... }
      // }
    }
    Views: {
      // Views will be generated
    }
    Functions: {
      // Functions will be generated
    }
    Enums: {
      // Enums will be generated
      // Example: user_role: 'admin' | 'medico' | 'enfermera' | 'secretaria'
    }
    CompositeTypes: {
      // Composite types will be generated
    }
  }
}
