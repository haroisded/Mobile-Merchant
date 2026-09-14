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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      merchants: {
        Row: {
          address: string | null
          category: Database["public"]["Enums"]["store_category"]
          contact_email: string | null
          created_at: string
          currency: string
          id: string
          name: string
          owner_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          category: Database["public"]["Enums"]["store_category"]
          contact_email?: string | null
          created_at?: string
          currency?: string
          id?: string
          name: string
          owner_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          category?: Database["public"]["Enums"]["store_category"]
          contact_email?: string | null
          created_at?: string
          currency?: string
          id?: string
          name?: string
          owner_id?: string
          phone?: string | null
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_fk"
            columns: ["parent_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      product_components: {
        Row: {
          component_id: string
          id: string
          merchant_id: string
          position: number
          product_id: string
          qty: number
          unit: Database["public"]["Enums"]["measure_unit"] | null
        }
        Insert: {
          component_id: string
          id?: string
          merchant_id: string
          position?: number
          product_id: string
          qty: number
          unit?: Database["public"]["Enums"]["measure_unit"] | null
        }
        Update: {
          component_id?: string
          id?: string
          merchant_id?: string
          position?: number
          product_id?: string
          qty?: number
          unit?: Database["public"]["Enums"]["measure_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "product_components_component_fk"
            columns: ["component_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "product_components_product_fk"
            columns: ["product_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      product_custom_fields: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["custom_field_kind"]
          label: string
          merchant_id: string
          position: number
          product_id: string
          value: string | null
        }
        Insert: {
          id?: string
          kind?: Database["public"]["Enums"]["custom_field_kind"]
          label: string
          merchant_id: string
          position?: number
          product_id: string
          value?: string | null
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["custom_field_kind"]
          label?: string
          merchant_id?: string
          position?: number
          product_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_custom_fields_product_fk"
            columns: ["product_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      product_operating_hours: {
        Row: {
          closes: string
          id: string
          merchant_id: string
          opens: string
          product_id: string
          weekday: number
        }
        Insert: {
          closes: string
          id?: string
          merchant_id: string
          opens: string
          product_id: string
          weekday: number
        }
        Update: {
          closes?: string
          id?: string
          merchant_id?: string
          opens?: string
          product_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_operating_hours_product_fk"
            columns: ["product_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      product_rate_tiers: {
        Row: {
          id: string
          merchant_id: string
          note: string | null
          period: Database["public"]["Enums"]["rate_period"]
          position: number
          price: number
          product_id: string
        }
        Insert: {
          id?: string
          merchant_id: string
          note?: string | null
          period: Database["public"]["Enums"]["rate_period"]
          position?: number
          price: number
          product_id: string
        }
        Update: {
          id?: string
          merchant_id?: string
          note?: string | null
          period?: Database["public"]["Enums"]["rate_period"]
          position?: number
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_rate_tiers_product_fk"
            columns: ["product_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      product_variant_attributes: {
        Row: {
          id: string
          merchant_id: string
          name: string
          position: number
          product_id: string
          values: string[]
        }
        Insert: {
          id?: string
          merchant_id: string
          name: string
          position?: number
          product_id: string
          values: string[]
        }
        Update: {
          id?: string
          merchant_id?: string
          name?: string
          position?: number
          product_id?: string
          values?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_attributes_product_fk"
            columns: ["product_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          id: string
          label: string
          merchant_id: string
          options: string[]
          position: number
          price_delta: number
          product_id: string
          qty_on_hand: number | null
          sku: string | null
        }
        Insert: {
          barcode?: string | null
          id?: string
          label: string
          merchant_id: string
          options: string[]
          position?: number
          price_delta?: number
          product_id: string
          qty_on_hand?: number | null
          sku?: string | null
        }
        Update: {
          barcode?: string | null
          id?: string
          label?: string
          merchant_id?: string
          options?: string[]
          position?: number
          price_delta?: number
          product_id?: string
          qty_on_hand?: number | null
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_fk"
            columns: ["product_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      products: {
        Row: {
          advance_window_days: number | null
          barcode: string | null
          batch_tracking: boolean
          blackout_dates: string[]
          buffer_minutes: number | null
          cancellation_fee: number | null
          capacity_per_unit: number | null
          category_id: string
          conversion_factor: number | null
          cost_price: number | null
          created_at: string
          default_end_time: string | null
          default_start_time: string | null
          deposit_amount: number | null
          description: string | null
          discountable: boolean
          duration_mode: Database["public"]["Enums"]["duration_mode"] | null
          expiry_alert_days: number | null
          expiry_date: string | null
          extra_unit_fee: number | null
          has_variants: boolean
          id: string
          image_file: string | null
          internal_notes: string | null
          is_composite: boolean
          is_low_stock: boolean | null
          late_fee_per_hour: number | null
          lead_time_days: number | null
          max_duration: number | null
          max_duration_unit: Database["public"]["Enums"]["measure_unit"] | null
          max_stock: number | null
          merchant_id: string
          min_duration: number | null
          min_duration_unit: Database["public"]["Enums"]["measure_unit"] | null
          name: string
          overbooking_allowed: boolean
          perishable: boolean
          pricing_unit: Database["public"]["Enums"]["measure_unit"] | null
          purchase_unit: Database["public"]["Enums"]["measure_unit"] | null
          qty_on_hand: number | null
          reorder_qty: number | null
          reorder_threshold: number | null
          selling_price: number | null
          shelf_life_days: number | null
          sku: string | null
          sold_directly: boolean
          status: Database["public"]["Enums"]["product_status"]
          storage_location: string | null
          subcategory_id: string | null
          supplier_id: string | null
          supplier_item_code: string | null
          tags: string[]
          tax_class_id: string | null
          total_units: number | null
          track_inventory: boolean
          type: Database["public"]["Enums"]["product_type"]
          uom: Database["public"]["Enums"]["measure_unit"] | null
          updated_at: string
          usage_unit: Database["public"]["Enums"]["measure_unit"] | null
        }
        Insert: {
          advance_window_days?: number | null
          barcode?: string | null
          batch_tracking?: boolean
          blackout_dates?: string[]
          buffer_minutes?: number | null
          cancellation_fee?: number | null
          capacity_per_unit?: number | null
          category_id: string
          conversion_factor?: number | null
          cost_price?: number | null
          created_at?: string
          default_end_time?: string | null
          default_start_time?: string | null
          deposit_amount?: number | null
          description?: string | null
          discountable?: boolean
          duration_mode?: Database["public"]["Enums"]["duration_mode"] | null
          expiry_alert_days?: number | null
          expiry_date?: string | null
          extra_unit_fee?: number | null
          has_variants?: boolean
          id?: string
          image_file?: string | null
          internal_notes?: string | null
          is_composite?: boolean
          is_low_stock?: boolean | null
          late_fee_per_hour?: number | null
          lead_time_days?: number | null
          max_duration?: number | null
          max_duration_unit?: Database["public"]["Enums"]["measure_unit"] | null
          max_stock?: number | null
          merchant_id: string
          min_duration?: number | null
          min_duration_unit?: Database["public"]["Enums"]["measure_unit"] | null
          name: string
          overbooking_allowed?: boolean
          perishable?: boolean
          pricing_unit?: Database["public"]["Enums"]["measure_unit"] | null
          purchase_unit?: Database["public"]["Enums"]["measure_unit"] | null
          qty_on_hand?: number | null
          reorder_qty?: number | null
          reorder_threshold?: number | null
          selling_price?: number | null
          shelf_life_days?: number | null
          sku?: string | null
          sold_directly?: boolean
          status?: Database["public"]["Enums"]["product_status"]
          storage_location?: string | null
          subcategory_id?: string | null
          supplier_id?: string | null
          supplier_item_code?: string | null
          tags?: string[]
          tax_class_id?: string | null
          total_units?: number | null
          track_inventory?: boolean
          type: Database["public"]["Enums"]["product_type"]
          uom?: Database["public"]["Enums"]["measure_unit"] | null
          updated_at?: string
          usage_unit?: Database["public"]["Enums"]["measure_unit"] | null
        }
        Update: {
          advance_window_days?: number | null
          barcode?: string | null
          batch_tracking?: boolean
          blackout_dates?: string[]
          buffer_minutes?: number | null
          cancellation_fee?: number | null
          capacity_per_unit?: number | null
          category_id?: string
          conversion_factor?: number | null
          cost_price?: number | null
          created_at?: string
          default_end_time?: string | null
          default_start_time?: string | null
          deposit_amount?: number | null
          description?: string | null
          discountable?: boolean
          duration_mode?: Database["public"]["Enums"]["duration_mode"] | null
          expiry_alert_days?: number | null
          expiry_date?: string | null
          extra_unit_fee?: number | null
          has_variants?: boolean
          id?: string
          image_file?: string | null
          internal_notes?: string | null
          is_composite?: boolean
          is_low_stock?: boolean | null
          late_fee_per_hour?: number | null
          lead_time_days?: number | null
          max_duration?: number | null
          max_duration_unit?: Database["public"]["Enums"]["measure_unit"] | null
          max_stock?: number | null
          merchant_id?: string
          min_duration?: number | null
          min_duration_unit?: Database["public"]["Enums"]["measure_unit"] | null
          name?: string
          overbooking_allowed?: boolean
          perishable?: boolean
          pricing_unit?: Database["public"]["Enums"]["measure_unit"] | null
          purchase_unit?: Database["public"]["Enums"]["measure_unit"] | null
          qty_on_hand?: number | null
          reorder_qty?: number | null
          reorder_threshold?: number | null
          selling_price?: number | null
          shelf_life_days?: number | null
          sku?: string | null
          sold_directly?: boolean
          status?: Database["public"]["Enums"]["product_status"]
          storage_location?: string | null
          subcategory_id?: string | null
          supplier_id?: string | null
          supplier_item_code?: string | null
          tags?: string[]
          tax_class_id?: string | null
          total_units?: number | null
          track_inventory?: boolean
          type?: Database["public"]["Enums"]["product_type"]
          uom?: Database["public"]["Enums"]["measure_unit"] | null
          updated_at?: string
          usage_unit?: Database["public"]["Enums"]["measure_unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_fk"
            columns: ["category_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_fk"
            columns: ["subcategory_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "products_supplier_fk"
            columns: ["supplier_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "products_tax_class_fk"
            columns: ["tax_class_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "tax_classes"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          merchant_id: string
          name: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          name: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_classes: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          name: string
          rate: number
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          name: string
          rate?: number
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          name?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_classes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_current_user: { Args: never; Returns: undefined }
      save_product: { Args: { payload: Json }; Returns: string }
    }
    Enums: {
      custom_field_kind: "text" | "number" | "date" | "boolean"
      duration_mode: "fixed_slot" | "flexible_range"
      measure_unit:
        | "piece"
        | "box"
        | "pack"
        | "kg"
        | "g"
        | "l"
        | "ml"
        | "minute"
        | "hour"
        | "day"
        | "week"
        | "month"
        | "night"
        | "session"
      product_status: "draft" | "active" | "inactive" | "archived"
      product_type: "stock" | "rental" | "bookable" | "flat"
      rate_period: "hour" | "day" | "week" | "month" | "night"
      store_category:
        | "restaurant"
        | "cafe"
        | "clothing"
        | "grocery"
        | "bakery"
        | "electronics"
        | "pharmacy"
        | "bookstore"
        | "fitness"
        | "other"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      custom_field_kind: ["text", "number", "date", "boolean"],
      duration_mode: ["fixed_slot", "flexible_range"],
      measure_unit: [
        "piece",
        "box",
        "pack",
        "kg",
        "g",
        "l",
        "ml",
        "minute",
        "hour",
        "day",
        "week",
        "month",
        "night",
        "session",
      ],
      product_status: ["draft", "active", "inactive", "archived"],
      product_type: ["stock", "rental", "bookable", "flat"],
      rate_period: ["hour", "day", "week", "month", "night"],
      store_category: [
        "restaurant",
        "cafe",
        "clothing",
        "grocery",
        "bakery",
        "electronics",
        "pharmacy",
        "bookstore",
        "fitness",
        "other",
      ],
    },
  },
} as const
