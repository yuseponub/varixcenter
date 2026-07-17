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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          descripcion: string
          id: string
          referencia_id: string | null
          referencia_tipo: string | null
          resuelta: boolean
          resuelta_at: string | null
          resuelta_notas: string | null
          resuelta_por: string | null
          severidad: Database["public"]["Enums"]["alert_severidad"]
          tipo: Database["public"]["Enums"]["alert_tipo"]
          titulo: string
        }
        Insert: {
          created_at?: string
          descripcion: string
          id?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          resuelta?: boolean
          resuelta_at?: string | null
          resuelta_notas?: string | null
          resuelta_por?: string | null
          severidad: Database["public"]["Enums"]["alert_severidad"]
          tipo: Database["public"]["Enums"]["alert_tipo"]
          titulo: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          id?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          resuelta?: boolean
          resuelta_at?: string | null
          resuelta_notas?: string | null
          resuelta_por?: string | null
          severidad?: Database["public"]["Enums"]["alert_severidad"]
          tipo?: Database["public"]["Enums"]["alert_tipo"]
          titulo?: string
        }
        Relationships: []
      }
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
          doctor_id: string | null
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
          doctor_id?: string | null
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
          doctor_id?: string | null
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
      appointments_legacy: {
        Row: {
          descripcion: string | null
          doctor_name_original: string | null
          fecha_hora_fin: string | null
          fecha_hora_inicio: string
          id: string
          migrated_at: string
          patient_id: string | null
          patient_name_original: string
          raw_ics: string | null
          raw_summary: string | null
          sesiones_extraidas: string | null
          source: string
          telefono_extraido: string | null
        }
        Insert: {
          descripcion?: string | null
          doctor_name_original?: string | null
          fecha_hora_fin?: string | null
          fecha_hora_inicio: string
          id?: string
          migrated_at?: string
          patient_id?: string | null
          patient_name_original: string
          raw_ics?: string | null
          raw_summary?: string | null
          sesiones_extraidas?: string | null
          source?: string
          telefono_extraido?: string | null
        }
        Update: {
          descripcion?: string | null
          doctor_name_original?: string | null
          fecha_hora_fin?: string | null
          fecha_hora_inicio?: string
          id?: string
          migrated_at?: string
          patient_id?: string | null
          patient_name_original?: string
          raw_ics?: string | null
          raw_summary?: string | null
          sesiones_extraidas?: string | null
          source?: string
          telefono_extraido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_legacy_patient_id_fkey"
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
      cash_closings: {
        Row: {
          cierre_numero: string
          cierre_photo_path: string | null
          closed_by: string
          conteo_fisico_efectivo: number
          created_at: string
          diferencia: number
          diferencia_justificacion: string | null
          estado: Database["public"]["Enums"]["cierre_estado"]
          fecha_cierre: string
          grand_total: number
          id: string
          notas: string | null
          reopen_justificacion: string | null
          reopened_at: string | null
          reopened_by: string | null
          total_anulaciones: number
          total_descuentos: number
          total_efectivo: number
          total_nequi: number
          total_tarjeta: number
          total_transferencia: number
          updated_at: string
        }
        Insert: {
          cierre_numero: string
          cierre_photo_path?: string | null
          closed_by: string
          conteo_fisico_efectivo: number
          created_at?: string
          diferencia?: number
          diferencia_justificacion?: string | null
          estado?: Database["public"]["Enums"]["cierre_estado"]
          fecha_cierre: string
          grand_total?: number
          id?: string
          notas?: string | null
          reopen_justificacion?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          total_anulaciones?: number
          total_descuentos?: number
          total_efectivo?: number
          total_nequi?: number
          total_tarjeta?: number
          total_transferencia?: number
          updated_at?: string
        }
        Update: {
          cierre_numero?: string
          cierre_photo_path?: string | null
          closed_by?: string
          conteo_fisico_efectivo?: number
          created_at?: string
          diferencia?: number
          diferencia_justificacion?: string | null
          estado?: Database["public"]["Enums"]["cierre_estado"]
          fecha_cierre?: string
          grand_total?: number
          id?: string
          notas?: string | null
          reopen_justificacion?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          total_anulaciones?: number
          total_descuentos?: number
          total_efectivo?: number
          total_nequi?: number
          total_tarjeta?: number
          total_transferencia?: number
          updated_at?: string
        }
        Relationships: []
      }
      closing_counter: {
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
      legacy_history_photos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          medical_record_id: string
          orden: number
          rotation: number | null
          storage_path: string
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          medical_record_id: string
          orden?: number
          rotation?: number | null
          storage_path: string
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          medical_record_id?: string
          orden?: number
          rotation?: number | null
          storage_path?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_history_photos_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      medias_cierre_counter: {
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
      medias_cierres: {
        Row: {
          cierre_numero: string
          cierre_photo_path: string | null
          closed_by: string
          conteo_fisico_efectivo: number
          created_at: string
          diferencia: number
          diferencia_justificacion: string | null
          estado: Database["public"]["Enums"]["cierre_estado"]
          fecha_cierre: string
          grand_total: number
          id: string
          notas: string | null
          reopen_justificacion: string | null
          reopened_at: string | null
          reopened_by: string | null
          total_efectivo: number
          total_nequi: number
          total_tarjeta: number
          total_transferencia: number
          updated_at: string
        }
        Insert: {
          cierre_numero: string
          cierre_photo_path?: string | null
          closed_by: string
          conteo_fisico_efectivo: number
          created_at?: string
          diferencia?: number
          diferencia_justificacion?: string | null
          estado?: Database["public"]["Enums"]["cierre_estado"]
          fecha_cierre: string
          grand_total?: number
          id?: string
          notas?: string | null
          reopen_justificacion?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          total_efectivo?: number
          total_nequi?: number
          total_tarjeta?: number
          total_transferencia?: number
          updated_at?: string
        }
        Update: {
          cierre_numero?: string
          cierre_photo_path?: string | null
          closed_by?: string
          conteo_fisico_efectivo?: number
          created_at?: string
          diferencia?: number
          diferencia_justificacion?: string | null
          estado?: Database["public"]["Enums"]["cierre_estado"]
          fecha_cierre?: string
          grand_total?: number
          id?: string
          notas?: string | null
          reopen_justificacion?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          total_efectivo?: number
          total_nequi?: number
          total_tarjeta?: number
          total_transferencia?: number
          updated_at?: string
        }
        Relationships: []
      }
      medias_products: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          id: string
          precio: number
          stock_devoluciones: number
          stock_normal: number
          talla: Database["public"]["Enums"]["medias_talla"]
          tipo: Database["public"]["Enums"]["medias_tipo"]
          umbral_alerta: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          id?: string
          precio: number
          stock_devoluciones?: number
          stock_normal?: number
          talla: Database["public"]["Enums"]["medias_talla"]
          tipo: Database["public"]["Enums"]["medias_tipo"]
          umbral_alerta?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          precio?: number
          stock_devoluciones?: number
          stock_normal?: number
          talla?: Database["public"]["Enums"]["medias_talla"]
          tipo?: Database["public"]["Enums"]["medias_tipo"]
          umbral_alerta?: number
          updated_at?: string
        }
        Relationships: []
      }
      medias_return_counter: {
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
      medias_returns: {
        Row: {
          aprobado_at: string | null
          aprobador_id: string | null
          cantidad: number
          created_at: string
          estado: Database["public"]["Enums"]["devolucion_estado"]
          foto_path: string | null
          id: string
          metodo_reembolso: Database["public"]["Enums"]["reembolso_metodo"]
          monto_devolucion: number
          motivo: string
          notas_aprobador: string | null
          numero_devolucion: string
          product_codigo: string
          product_talla: string
          product_tipo: string
          sale_id: string
          sale_item_id: string
          solicitante_id: string
          updated_at: string
        }
        Insert: {
          aprobado_at?: string | null
          aprobador_id?: string | null
          cantidad: number
          created_at?: string
          estado?: Database["public"]["Enums"]["devolucion_estado"]
          foto_path?: string | null
          id?: string
          metodo_reembolso: Database["public"]["Enums"]["reembolso_metodo"]
          monto_devolucion: number
          motivo: string
          notas_aprobador?: string | null
          numero_devolucion: string
          product_codigo: string
          product_talla: string
          product_tipo: string
          sale_id: string
          sale_item_id: string
          solicitante_id: string
          updated_at?: string
        }
        Update: {
          aprobado_at?: string | null
          aprobador_id?: string | null
          cantidad?: number
          created_at?: string
          estado?: Database["public"]["Enums"]["devolucion_estado"]
          foto_path?: string | null
          id?: string
          metodo_reembolso?: Database["public"]["Enums"]["reembolso_metodo"]
          monto_devolucion?: number
          motivo?: string
          notas_aprobador?: string | null
          numero_devolucion?: string
          product_codigo?: string
          product_talla?: string
          product_tipo?: string
          sale_id?: string
          sale_item_id?: string
          solicitante_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medias_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "medias_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medias_returns_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "medias_sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      medias_sale_items: {
        Row: {
          created_at: string
          id: string
          product_codigo: string
          product_id: string
          product_talla: string
          product_tipo: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_codigo: string
          product_id: string
          product_talla: string
          product_tipo: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_codigo?: string
          product_id?: string
          product_talla?: string
          product_tipo?: string
          quantity?: number
          sale_id?: string
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "medias_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "medias_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medias_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "medias_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      medias_sale_methods: {
        Row: {
          comprobante_path: string | null
          created_at: string
          id: string
          metodo: Database["public"]["Enums"]["payment_method_type"]
          monto: number
          sale_id: string
        }
        Insert: {
          comprobante_path?: string | null
          created_at?: string
          id?: string
          metodo: Database["public"]["Enums"]["payment_method_type"]
          monto: number
          sale_id: string
        }
        Update: {
          comprobante_path?: string | null
          created_at?: string
          id?: string
          metodo?: Database["public"]["Enums"]["payment_method_type"]
          monto?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medias_sale_methods_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "medias_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      medias_sales: {
        Row: {
          created_at: string
          eliminacion_justificacion: string | null
          eliminado_at: string | null
          eliminado_por: string | null
          estado: Database["public"]["Enums"]["payment_status"]
          id: string
          numero_venta: string
          patient_id: string | null
          receptor_efectivo_id: string | null
          subtotal: number
          total: number
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          eliminacion_justificacion?: string | null
          eliminado_at?: string | null
          eliminado_por?: string | null
          estado?: Database["public"]["Enums"]["payment_status"]
          id?: string
          numero_venta: string
          patient_id?: string | null
          receptor_efectivo_id?: string | null
          subtotal: number
          total: number
          vendedor_id: string
        }
        Update: {
          created_at?: string
          eliminacion_justificacion?: string | null
          eliminado_at?: string | null
          eliminado_por?: string | null
          estado?: Database["public"]["Enums"]["payment_status"]
          id?: string
          numero_venta?: string
          patient_id?: string | null
          receptor_efectivo_id?: string | null
          subtotal?: number
          total?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medias_sales_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medias_stock_movements: {
        Row: {
          cantidad: number
          created_at: string
          created_by: string
          id: string
          notas: string | null
          product_id: string
          referencia_id: string | null
          referencia_tipo: string | null
          stock_devoluciones_antes: number
          stock_devoluciones_despues: number
          stock_normal_antes: number
          stock_normal_despues: number
          tipo: Database["public"]["Enums"]["medias_movement_type"]
        }
        Insert: {
          cantidad: number
          created_at?: string
          created_by: string
          id?: string
          notas?: string | null
          product_id: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          stock_devoluciones_antes: number
          stock_devoluciones_despues: number
          stock_normal_antes: number
          stock_normal_despues: number
          tipo: Database["public"]["Enums"]["medias_movement_type"]
        }
        Update: {
          cantidad?: number
          created_at?: string
          created_by?: string
          id?: string
          notas?: string | null
          product_id?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          stock_devoluciones_antes?: number
          stock_devoluciones_despues?: number
          stock_normal_antes?: number
          stock_normal_despues?: number
          tipo?: Database["public"]["Enums"]["medias_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "medias_stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "medias_products"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_records: {
        Row: {
          antecedentes: Json
          appointment_id: string | null
          audios: Json | null
          ceap_pierna_derecha:
            | Database["public"]["Enums"]["ceap_classification"]
            | null
          ceap_pierna_izquierda:
            | Database["public"]["Enums"]["ceap_classification"]
            | null
          created_at: string
          created_by: string | null
          diagnostico: string | null
          diagrama_piernas: string | null
          doctor_id: string | null
          estado: Database["public"]["Enums"]["medical_record_status"]
          id: string
          inicio_relacionado: Json
          laboratorio_vascular: Json
          legacy_record_id: string | null
          medicamentos: string | null
          nombre_medico_legacy: string | null
          patient_id: string
          programa_terapeutico_texto: string | null
          signos: Json
          sintomas: Json
          source: string
          tratamiento_ids: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          antecedentes?: Json
          appointment_id?: string | null
          audios?: Json | null
          ceap_pierna_derecha?:
            | Database["public"]["Enums"]["ceap_classification"]
            | null
          ceap_pierna_izquierda?:
            | Database["public"]["Enums"]["ceap_classification"]
            | null
          created_at?: string
          created_by?: string | null
          diagnostico?: string | null
          diagrama_piernas?: string | null
          doctor_id?: string | null
          estado?: Database["public"]["Enums"]["medical_record_status"]
          id?: string
          inicio_relacionado?: Json
          laboratorio_vascular?: Json
          legacy_record_id?: string | null
          medicamentos?: string | null
          nombre_medico_legacy?: string | null
          patient_id: string
          programa_terapeutico_texto?: string | null
          signos?: Json
          sintomas?: Json
          source?: string
          tratamiento_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          antecedentes?: Json
          appointment_id?: string | null
          audios?: Json | null
          ceap_pierna_derecha?:
            | Database["public"]["Enums"]["ceap_classification"]
            | null
          ceap_pierna_izquierda?:
            | Database["public"]["Enums"]["ceap_classification"]
            | null
          created_at?: string
          created_by?: string | null
          diagnostico?: string | null
          diagrama_piernas?: string | null
          doctor_id?: string | null
          estado?: Database["public"]["Enums"]["medical_record_status"]
          id?: string
          inicio_relacionado?: Json
          laboratorio_vascular?: Json
          legacy_record_id?: string | null
          medicamentos?: string | null
          nombre_medico_legacy?: string | null
          patient_id?: string
          programa_terapeutico_texto?: string | null
          signos?: Json
          sintomas?: Json
          source?: string
          tratamiento_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_legacy_record_id_fkey"
            columns: ["legacy_record_id"]
            isOneToOne: false
            referencedRelation: "patient_legacy_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          appointment_id: string
          created_at: string
          enviado_at: string | null
          error_code: number | null
          error_message: string | null
          estado: Database["public"]["Enums"]["notification_status"]
          id: string
          intentos: number
          mensaje: string
          patient_id: string
          siguiente_reintento_at: string | null
          telefono_destino: string
          tipo_recordatorio: Database["public"]["Enums"]["reminder_type"]
          twilio_message_sid: string | null
        }
        Insert: {
          appointment_id: string
          created_at?: string
          enviado_at?: string | null
          error_code?: number | null
          error_message?: string | null
          estado?: Database["public"]["Enums"]["notification_status"]
          id?: string
          intentos?: number
          mensaje: string
          patient_id: string
          siguiente_reintento_at?: string | null
          telefono_destino: string
          tipo_recordatorio: Database["public"]["Enums"]["reminder_type"]
          twilio_message_sid?: string | null
        }
        Update: {
          appointment_id?: string
          created_at?: string
          enviado_at?: string | null
          error_code?: number | null
          error_message?: string | null
          estado?: Database["public"]["Enums"]["notification_status"]
          id?: string
          intentos?: number
          mensaje?: string
          patient_id?: string
          siguiente_reintento_at?: string | null
          telefono_destino?: string
          tipo_recordatorio?: Database["public"]["Enums"]["reminder_type"]
          twilio_message_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_attendances: {
        Row: {
          created_at: string
          fecha: string
          hora: string
          id: string
          marked_by: string
          patient_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          hora?: string
          id?: string
          marked_by: string
          patient_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          hora?: string
          id?: string
          marked_by?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_attendances_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_legacy_records: {
        Row: {
          access_cedula: string | null
          access_historia_id: number | null
          antecedentes: Json
          created_at: string
          diagnosticos: Json
          examenes: Json
          fecha_ingreso_original: string | null
          grado_varices: string | null
          id: string
          medicamentos: string | null
          migrated_at: string
          nombre_medico: string | null
          numero_visitas: string | null
          observaciones: string | null
          observaciones_alerta: string | null
          patient_id: string
          publicidad: string | null
          raw_paciente: Json
          raw_plan_cirugia: Json
          raw_plan_costos: Json
          sintomas: Json
          source: string
          tiempo_evolucion: string | null
          tratamientos: Json
        }
        Insert: {
          access_cedula?: string | null
          access_historia_id?: number | null
          antecedentes?: Json
          created_at?: string
          diagnosticos?: Json
          examenes?: Json
          fecha_ingreso_original?: string | null
          grado_varices?: string | null
          id?: string
          medicamentos?: string | null
          migrated_at?: string
          nombre_medico?: string | null
          numero_visitas?: string | null
          observaciones?: string | null
          observaciones_alerta?: string | null
          patient_id: string
          publicidad?: string | null
          raw_paciente?: Json
          raw_plan_cirugia?: Json
          raw_plan_costos?: Json
          sintomas?: Json
          source?: string
          tiempo_evolucion?: string | null
          tratamientos?: Json
        }
        Update: {
          access_cedula?: string | null
          access_historia_id?: number | null
          antecedentes?: Json
          created_at?: string
          diagnosticos?: Json
          examenes?: Json
          fecha_ingreso_original?: string | null
          grado_varices?: string | null
          id?: string
          medicamentos?: string | null
          migrated_at?: string
          nombre_medico?: string | null
          numero_visitas?: string | null
          observaciones?: string | null
          observaciones_alerta?: string | null
          patient_id?: string
          publicidad?: string | null
          raw_paciente?: Json
          raw_plan_cirugia?: Json
          raw_plan_costos?: Json
          sintomas?: Json
          source?: string
          tiempo_evolucion?: string | null
          tratamientos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "patient_legacy_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          apellido: string
          cedula: string | null
          celular: string | null
          ciudad: string | null
          contacto_emergencia_nombre: string | null
          contacto_emergencia_parentesco: string | null
          contacto_emergencia_telefono: string | null
          created_at: string
          created_by: string | null
          direccion: string | null
          email: string | null
          estado_civil: string | null
          fecha_nacimiento: string | null
          fecha_registro: string | null
          id: string
          nombre: string
          ocupacion: string | null
          pais: string | null
          updated_at: string
        }
        Insert: {
          apellido: string
          cedula?: string | null
          celular?: string | null
          ciudad?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_parentesco?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string | null
          id?: string
          nombre: string
          ocupacion?: string | null
          pais?: string | null
          updated_at?: string
        }
        Update: {
          apellido?: string
          cedula?: string | null
          celular?: string | null
          ciudad?: string | null
          contacto_emergencia_nombre?: string | null
          contacto_emergencia_parentesco?: string | null
          contacto_emergencia_telefono?: string | null
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          estado_civil?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string | null
          id?: string
          nombre?: string
          ocupacion?: string | null
          pais?: string | null
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
          nota: string | null
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
          nota?: string | null
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
          nota?: string | null
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
      progress_notes: {
        Row: {
          appointment_id: string | null
          created_at: string
          created_by: string
          id: string
          medical_record_id: string
          nota: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          medical_record_id: string
          nota: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          medical_record_id?: string
          nota?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_notes_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_counter: {
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
      purchase_items: {
        Row: {
          cantidad: number
          costo_unitario: number
          created_at: string
          id: string
          product_codigo: string
          product_id: string
          product_talla: string
          product_tipo: string
          purchase_id: string
          subtotal: number
        }
        Insert: {
          cantidad: number
          costo_unitario: number
          created_at?: string
          id?: string
          product_codigo: string
          product_id: string
          product_talla: string
          product_tipo: string
          purchase_id: string
          subtotal: number
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          product_codigo?: string
          product_id?: string
          product_talla?: string
          product_tipo?: string
          purchase_id?: string
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "medias_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          anulacion_justificacion: string | null
          anulado_at: string | null
          anulado_por: string | null
          created_at: string
          created_by: string
          estado: Database["public"]["Enums"]["compra_estado"]
          factura_path: string
          fecha_factura: string
          id: string
          notas: string | null
          numero_compra: string
          numero_factura: string | null
          proveedor: string
          recibido_at: string | null
          recibido_por: string | null
          total: number
          updated_at: string
        }
        Insert: {
          anulacion_justificacion?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          created_at?: string
          created_by: string
          estado?: Database["public"]["Enums"]["compra_estado"]
          factura_path: string
          fecha_factura: string
          id?: string
          notas?: string | null
          numero_compra: string
          numero_factura?: string | null
          proveedor: string
          recibido_at?: string | null
          recibido_por?: string | null
          total: number
          updated_at?: string
        }
        Update: {
          anulacion_justificacion?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          created_at?: string
          created_by?: string
          estado?: Database["public"]["Enums"]["compra_estado"]
          factura_path?: string
          fecha_factura?: string
          id?: string
          notas?: string | null
          numero_compra?: string
          numero_factura?: string | null
          proveedor?: string
          recibido_at?: string | null
          recibido_por?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json
          medical_record_id: string
          notas: string | null
          total: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          medical_record_id: string
          notas?: string | null
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          medical_record_id?: string
          notas?: string | null
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          activo: boolean
          categoria: Database["public"]["Enums"]["service_categoria"]
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
          categoria?: Database["public"]["Enums"]["service_categoria"]
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
          categoria?: Database["public"]["Enums"]["service_categoria"]
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
      venta_counter: {
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
      approve_medias_return: {
        Args: { p_notas?: string; p_return_id: string }
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
      create_cash_closing: {
        Args: {
          p_cierre_photo_path?: string
          p_conteo_fisico: number
          p_diferencia_justificacion: string
          p_fecha: string
          p_notas?: string
        }
        Returns: Json
      }
      create_inventory_adjustment: {
        Args: {
          p_cantidad: number
          p_product_id: string
          p_razon: string
          p_stock_type: string
          p_tipo: string
        }
        Returns: Json
      }
      create_medias_cierre: {
        Args: {
          p_cierre_photo_path?: string
          p_conteo_fisico: number
          p_diferencia_justificacion: string
          p_fecha: string
          p_notas?: string
        }
        Returns: Json
      }
      create_medias_return: {
        Args: {
          p_cantidad: number
          p_foto_path?: string
          p_metodo_reembolso: string
          p_motivo: string
          p_sale_id: string
          p_sale_item_id: string
        }
        Returns: Json
      }
      create_medias_sale: {
        Args: {
          p_items: Json
          p_methods: Json
          p_patient_id: string
          p_receptor_efectivo_id: string
          p_vendedor_id: string
        }
        Returns: Json
      }
      create_payment_with_invoice:
        | {
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
        | {
            Args: {
              p_appointment_id?: string
              p_appointment_service_ids?: string[]
              p_created_by: string
              p_descuento: number
              p_descuento_justificacion: string
              p_items: Json
              p_methods: Json
              p_nota?: string
              p_patient_id: string
              p_subtotal: number
              p_total: number
            }
            Returns: Json
          }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      eliminar_medias_sale: {
        Args: { p_justificacion: string; p_sale_id: string }
        Returns: Json
      }
      enable_audit_for_table: {
        Args: { target_table: unknown }
        Returns: undefined
      }
      get_client_ip: { Args: never; Returns: unknown }
      get_closing_summary: { Args: { p_fecha: string }; Returns: Json }
      get_daily_income_breakdown: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_income_report: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_medias_cierre_summary: { Args: { p_fecha: string }; Returns: Json }
      get_next_closing_number: { Args: never; Returns: string }
      get_next_invoice_number: { Args: never; Returns: string }
      get_next_medias_cierre_number: { Args: never; Returns: string }
      get_next_medias_return_number: { Args: never; Returns: string }
      get_next_venta_number: { Args: never; Returns: string }
      get_request_header: { Args: { header_name: string }; Returns: string }
      get_rls_policies: {
        Args: { target_table: string }
        Returns: {
          policy_command: string
          policy_name: string
          policy_roles: string[]
        }[]
      }
      get_unclosed_days: { Args: { p_limit?: number }; Returns: Json }
      get_user_role: { Args: never; Returns: string }
      reject_medias_return: {
        Args: { p_notas?: string; p_return_id: string }
        Returns: Json
      }
      reopen_cash_closing: {
        Args: { p_cierre_id: string; p_justificacion: string }
        Returns: Json
      }
      reopen_medias_cierre: {
        Args: { p_cierre_id: string; p_justificacion: string }
        Returns: Json
      }
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
      alert_severidad: "info" | "advertencia" | "critico"
      alert_tipo: "pago_anulado" | "diferencia_cierre"
      appointment_status:
        | "programada"
        | "confirmada"
        | "en_sala"
        | "en_atencion"
        | "completada"
        | "cancelada"
        | "no_asistio"
      ceap_classification: "C0" | "C1" | "C2" | "C3" | "C4" | "C5" | "C6"
      cierre_estado: "abierto" | "cerrado" | "reabierto"
      compra_estado: "pendiente_recepcion" | "recibido" | "anulado"
      devolucion_estado: "pendiente" | "aprobada" | "rechazada"
      estado_pago_servicio: "pendiente" | "pagado"
      medias_movement_type:
        | "compra"
        | "venta"
        | "devolucion"
        | "ajuste_entrada"
        | "ajuste_salida"
        | "transferencia"
      medias_talla: "M" | "L" | "XL" | "XXL"
      medias_tipo: "Muslo" | "Panty" | "Rodilla"
      medical_record_status: "borrador" | "completado"
      notification_status: "pendiente" | "enviado" | "fallido" | "reintentando"
      payment_method_type: "efectivo" | "tarjeta" | "transferencia" | "nequi"
      payment_status: "activo" | "anulado"
      reembolso_metodo: "efectivo" | "cambio_producto"
      reminder_type: "24h" | "2h"
      service_categoria: "examen_lab" | "procedimiento" | "sesiones" | "insumo"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      alert_severidad: ["info", "advertencia", "critico"],
      alert_tipo: ["pago_anulado", "diferencia_cierre"],
      appointment_status: [
        "programada",
        "confirmada",
        "en_sala",
        "en_atencion",
        "completada",
        "cancelada",
        "no_asistio",
      ],
      ceap_classification: ["C0", "C1", "C2", "C3", "C4", "C5", "C6"],
      cierre_estado: ["abierto", "cerrado", "reabierto"],
      compra_estado: ["pendiente_recepcion", "recibido", "anulado"],
      devolucion_estado: ["pendiente", "aprobada", "rechazada"],
      estado_pago_servicio: ["pendiente", "pagado"],
      medias_movement_type: [
        "compra",
        "venta",
        "devolucion",
        "ajuste_entrada",
        "ajuste_salida",
        "transferencia",
      ],
      medias_talla: ["M", "L", "XL", "XXL"],
      medias_tipo: ["Muslo", "Panty", "Rodilla"],
      medical_record_status: ["borrador", "completado"],
      notification_status: ["pendiente", "enviado", "fallido", "reintentando"],
      payment_method_type: ["efectivo", "tarjeta", "transferencia", "nequi"],
      payment_status: ["activo", "anulado"],
      reembolso_metodo: ["efectivo", "cambio_producto"],
      reminder_type: ["24h", "2h"],
      service_categoria: ["examen_lab", "procedimiento", "sesiones", "insumo"],
      user_role: ["admin", "medico", "enfermera", "secretaria"],
    },
  },
} as const
