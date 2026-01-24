export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      appointment_services: {
        Row: {
          appointment_id: string
          cantidad: number
          created_at: string
          created_by: string
          estado_pago: Database["public"]["Enums"]["estado_pago_servicio"]
          id: string
          notas: string | null
          payment_item_id: string | null
          precio_unitario: number
          service_id: string
          service_name: string
          subtotal: number
          updated_at: string
        }
        Insert: {
          appointment_id: string
          cantidad?: number
          created_at?: string
          created_by: string
          estado_pago?: Database["public"]["Enums"]["estado_pago_servicio"]
          id?: string
          notas?: string | null
          payment_item_id?: string | null
          precio_unitario: number
          service_id: string
          service_name: string
          subtotal: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          cantidad?: number
          created_at?: string
          created_by?: string
          estado_pago?: Database["public"]["Enums"]["estado_pago_servicio"]
          id?: string
          notas?: string | null
          payment_item_id?: string | null
          precio_unitario?: number
          service_id?: string
          service_name?: string
          subtotal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_payment_item_id_fkey"
            columns: ["payment_item_id"]
            isOneToOne: false
            referencedRelation: "payment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          created_by: string | null
          doctor_id: string
          estado: Database["public"]["Enums"]["appointment_status"]
          fecha_hora_fin: string
          fecha_hora_inicio: string
          id: string
          motivo_consulta: string | null
          notas: string | null
          patient_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doctor_id: string
          estado?: Database["public"]["Enums"]["appointment_status"]
          fecha_hora_fin: string
          fecha_hora_inicio: string
          id?: string
          motivo_consulta?: string | null
          notas?: string | null
          patient_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doctor_id?: string
          estado?: Database["public"]["Enums"]["appointment_status"]
          fecha_hora_fin?: string
          fecha_hora_inicio?: string
          id?: string
          motivo_consulta?: string | null
          notas?: string | null
          patient_id?: string
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
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_fields: string[] | null
          client_ip: unknown
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
          session_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          client_ip?: unknown
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          session_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          client_ip?: unknown
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          session_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      invoice_counter: {
        Row: {
          id: number
          last_number: number
          prefix: string
        }
        Insert: {
          id?: number
          last_number?: number
          prefix?: string
        }
        Update: {
          id?: number
          last_number?: number
          prefix?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          apellido: string
          cedula: string
          celular: string
          contacto_emergencia_nombre: string
          contacto_emergencia_parentesco: string
          contacto_emergencia_telefono: string
          created_at: string
          created_by: string | null
          direccion: string | null
          email: string | null
          fecha_nacimiento: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          apellido: string
          cedula: string
          celular: string
          contacto_emergencia_nombre: string
          contacto_emergencia_parentesco: string
          contacto_emergencia_telefono: string
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          apellido?: string
          cedula?: string
          celular?: string
          contacto_emergencia_nombre?: string
          contacto_emergencia_parentesco?: string
          contacto_emergencia_telefono?: string
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_items: {
        Row: {
          created_at: string
          id: string
          payment_id: string
          quantity: number
          service_id: string
          service_name: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          payment_id: string
          quantity?: number
          service_id: string
          service_name: string
          subtotal: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          payment_id?: string
          quantity?: number
          service_id?: string
          service_name?: string
          subtotal?: number
          unit_price?: number
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
          },
        ]
      }
      payment_methods: {
        Row: {
          comprobante_path: string | null
          created_at: string
          id: string
          metodo: Database["public"]["Enums"]["payment_method_type"]
          monto: number
          payment_id: string
        }
        Insert: {
          comprobante_path?: string | null
          created_at?: string
          id?: string
          metodo: Database["public"]["Enums"]["payment_method_type"]
          monto: number
          payment_id: string
        }
        Update: {
          comprobante_path?: string | null
          created_at?: string
          id?: string
          metodo?: Database["public"]["Enums"]["payment_method_type"]
          monto?: number
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          anulacion_justificacion: string | null
          anulado_at: string | null
          anulado_por: string | null
          appointment_id: string | null
          created_at: string
          created_by: string
          descuento: number
          descuento_justificacion: string | null
          estado: Database["public"]["Enums"]["payment_status"]
          id: string
          numero_factura: string
          patient_id: string
          subtotal: number
          total: number
        }
        Insert: {
          anulacion_justificacion?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          appointment_id?: string | null
          created_at?: string
          created_by: string
          descuento?: number
          descuento_justificacion?: string | null
          estado?: Database["public"]["Enums"]["payment_status"]
          id?: string
          numero_factura: string
          patient_id: string
          subtotal: number
          total: number
        }
        Update: {
          anulacion_justificacion?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          appointment_id?: string | null
          created_at?: string
          created_by?: string
          descuento?: number
          descuento_justificacion?: string | null
          estado?: Database["public"]["Enums"]["payment_status"]
          id?: string
          numero_factura?: string
          patient_id?: string
          subtotal?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          descripcion: string | null
          id: string
          nombre: string
          precio_base: number
          precio_maximo: number | null
          precio_minimo: number | null
          precio_variable: boolean
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          precio_base: number
          precio_maximo?: number | null
          precio_minimo?: number | null
          precio_variable?: boolean
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          precio_base?: number
          precio_maximo?: number | null
          precio_minimo?: number | null
          precio_variable?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      doctors_view: {
        Row: {
          apellido: string | null
          email: string | null
          id: string | null
          nombre: string | null
        }
        Relationships: []
      }
      pending_services_by_patient: {
        Row: {
          appointment_date: string | null
          appointment_id: string | null
          cantidad: number | null
          created_at: string | null
          id: string | null
          notas: string | null
          patient_apellido: string | null
          patient_cedula: string | null
          patient_id: string | null
          patient_nombre: string | null
          precio_unitario: number | null
          service_id: string | null
          service_name: string | null
          subtotal: number | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      rls_status: {
        Row: {
          policy_count: number | null
          rls_enabled: boolean | null
          status: string | null
          table_name: unknown
        }
        Relationships: []
      }
    }
    Functions: {
      anular_pago: {
        Args: { p_justificacion: string; p_payment_id: string }
        Returns: Json
      }
      assign_role: {
        Args: {
          target_email: string
          target_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: string
      }
      bootstrap_first_admin: { Args: never; Returns: string }
      create_payment_with_invoice: {
        Args: {
          p_appointment_id?: string
          p_appointment_service_ids?: string[]
          p_created_by: string
          p_descuento: number
          p_descuento_justificacion: string
          p_items: Json
          p_methods: Json
          p_patient_id: string
          p_subtotal: number
          p_total: number
        }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      enable_audit_for_table: {
        Args: { target_table: unknown }
        Returns: undefined
      }
      get_client_ip: { Args: never; Returns: unknown }
      get_next_invoice_number: { Args: never; Returns: string }
      get_request_header: { Args: { header_name: string }; Returns: string }
      get_rls_policies: {
        Args: { target_table: string }
        Returns: {
          policy_command: string
          policy_name: string
          policy_roles: string[]
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      rls_check_passed: { Args: never; Returns: boolean }
      verify_rls_enabled: {
        Args: never
        Returns: {
          rls_enabled: boolean
          table_name: string
          warning: string
        }[]
      }
    }
    Enums: {
      appointment_status:
        | "programada"
        | "confirmada"
        | "en_sala"
        | "en_atencion"
        | "completada"
        | "cancelada"
        | "no_asistio"
      estado_pago_servicio: "pendiente" | "pagado"
      payment_method_type: "efectivo" | "tarjeta" | "transferencia" | "nequi"
      payment_status: "activo" | "anulado"
      user_role: "admin" | "medico" | "enfermera" | "secretaria"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      appointment_status: [
        "programada",
        "confirmada",
        "en_sala",
        "en_atencion",
        "completada",
        "cancelada",
        "no_asistio",
      ],
      estado_pago_servicio: ["pendiente", "pagado"],
      payment_method_type: ["efectivo", "tarjeta", "transferencia", "nequi"],
      payment_status: ["activo", "anulado"],
      user_role: ["admin", "medico", "enfermera", "secretaria"],
    },
  },
} as const
