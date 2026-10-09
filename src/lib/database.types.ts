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
      accounts: {
        Row: {
          account_name: string
          account_number: string | null
          account_type: string | null
          created_at: string
          disabled: boolean
          id: string
          is_group: boolean
          merchant_id: string
          parent_id: string | null
          root_type: string
        }
        Insert: {
          account_name: string
          account_number?: string | null
          account_type?: string | null
          created_at?: string
          disabled?: boolean
          id?: string
          is_group?: boolean
          merchant_id: string
          parent_id?: string | null
          root_type: string
        }
        Update: {
          account_name?: string
          account_number?: string | null
          account_type?: string | null
          created_at?: string
          disabled?: boolean
          id?: string
          is_group?: boolean
          merchant_id?: string
          parent_id?: string | null
          root_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_fk"
            columns: ["parent_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      accounts_settings: {
        Row: {
          accounts_frozen_till_date: string | null
          add_taxes_from_item_tax_template: boolean
          delete_linked_ledger_entries: boolean
          enable_discount_accounting: boolean
          enable_immutable_ledger: boolean
          frozen_accounts_modifier: string | null
          merchant_id: string
          unlink_payment_on_cancellation: boolean
        }
        Insert: {
          accounts_frozen_till_date?: string | null
          add_taxes_from_item_tax_template?: boolean
          delete_linked_ledger_entries?: boolean
          enable_discount_accounting?: boolean
          enable_immutable_ledger?: boolean
          frozen_accounts_modifier?: string | null
          merchant_id: string
          unlink_payment_on_cancellation?: boolean
        }
        Update: {
          accounts_frozen_till_date?: string | null
          add_taxes_from_item_tax_template?: boolean
          delete_linked_ledger_entries?: boolean
          enable_discount_accounting?: boolean
          enable_immutable_ledger?: boolean
          frozen_accounts_modifier?: string | null
          merchant_id?: string
          unlink_payment_on_cancellation?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "accounts_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_settings_modifier_fk"
            columns: ["frozen_accounts_modifier", "merchant_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          cost_center_name: string
          cost_center_number: string | null
          created_at: string
          disabled: boolean
          id: string
          is_group: boolean
          merchant_id: string
          parent_id: string | null
        }
        Insert: {
          cost_center_name: string
          cost_center_number?: string | null
          created_at?: string
          disabled?: boolean
          id?: string
          is_group?: boolean
          merchant_id: string
          parent_id?: string | null
        }
        Update: {
          cost_center_name?: string
          cost_center_number?: string | null
          created_at?: string
          disabled?: boolean
          id?: string
          is_group?: boolean
          merchant_id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_parent_fk"
            columns: ["parent_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          country_name: string
          currency_code: string | null
          number_format: string
          time_zones: string[]
        }
        Insert: {
          code: string
          country_name: string
          currency_code?: string | null
          number_format: string
          time_zones?: string[]
        }
        Update: {
          code?: string
          country_name?: string
          currency_code?: string | null
          number_format?: string
          time_zones?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "countries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currency_presets"
            referencedColumns: ["code"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          enabled: boolean
          fraction: string | null
          fraction_units: number | null
          id: string
          merchant_id: string
          number_format: string
          smallest_currency_fraction_value: number | null
          symbol: string | null
          symbol_on_right: boolean
        }
        Insert: {
          code: string
          enabled?: boolean
          fraction?: string | null
          fraction_units?: number | null
          id?: string
          merchant_id: string
          number_format: string
          smallest_currency_fraction_value?: number | null
          symbol?: string | null
          symbol_on_right?: boolean
        }
        Update: {
          code?: string
          enabled?: boolean
          fraction?: string | null
          fraction_units?: number | null
          id?: string
          merchant_id?: string
          number_format?: string
          smallest_currency_fraction_value?: number | null
          symbol?: string | null
          symbol_on_right?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "currencies_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "currency_presets"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "currencies_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_presets: {
        Row: {
          code: string
          currency_name: string
          fraction: string | null
          fraction_units: number | null
          number_format: string
          smallest_currency_fraction_value: number | null
          symbol: string | null
        }
        Insert: {
          code: string
          currency_name: string
          fraction?: string | null
          fraction_units?: number | null
          number_format: string
          smallest_currency_fraction_value?: number | null
          symbol?: string | null
        }
        Update: {
          code?: string
          currency_name?: string
          fraction?: string | null
          fraction_units?: number | null
          number_format?: string
          smallest_currency_fraction_value?: number | null
          symbol?: string | null
        }
        Relationships: []
      }
      doctypes: {
        Row: {
          kind: string
          name: string
          restrictable: boolean
          table_name: string
        }
        Insert: {
          kind: string
          name: string
          restrictable?: boolean
          table_name: string
        }
        Update: {
          kind?: string
          name?: string
          restrictable?: boolean
          table_name?: string
        }
        Relationships: []
      }
      fiscal_years: {
        Row: {
          created_at: string
          disabled: boolean
          id: string
          is_default: boolean
          is_short_year: boolean
          merchant_id: string
          year: string
          year_end_date: string
          year_start_date: string
        }
        Insert: {
          created_at?: string
          disabled?: boolean
          id?: string
          is_default?: boolean
          is_short_year?: boolean
          merchant_id: string
          year: string
          year_end_date: string
          year_start_date: string
        }
        Update: {
          created_at?: string
          disabled?: boolean
          id?: string
          is_default?: boolean
          is_short_year?: boolean
          merchant_id?: string
          year?: string
          year_end_date?: string
          year_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_years_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      global_defaults: {
        Row: {
          disable_in_words: boolean
          disable_rounded_total: boolean
          merchant_id: string
        }
        Insert: {
          disable_in_words?: boolean
          disable_rounded_total?: boolean
          merchant_id: string
        }
        Update: {
          disable_in_words?: boolean
          disable_rounded_total?: boolean
          merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_defaults_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      member_roles: {
        Row: {
          member_id: string
          merchant_id: string
          role_id: string
        }
        Insert: {
          member_id: string
          merchant_id: string
          role_id: string
        }
        Update: {
          member_id?: string
          merchant_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_roles_member_fk"
            columns: ["member_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_members"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "member_roles_role_fk"
            columns: ["role_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      merchant_members: {
        Row: {
          created_at: string
          email: string
          enabled: boolean
          full_name: string | null
          id: string
          merchant_id: string
          role_profile_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          enabled?: boolean
          full_name?: string | null
          id?: string
          merchant_id: string
          role_profile_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          enabled?: boolean
          full_name?: string | null
          id?: string
          merchant_id?: string
          role_profile_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_members_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_members_role_profile_fk"
            columns: ["role_profile_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "role_profiles"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      merchants: {
        Row: {
          abbr: string
          cost_center: string | null
          country_code: string
          created_at: string
          default_bank_account: string | null
          default_cash_account: string | null
          default_currency: string
          default_expense_account: string | null
          default_income_account: string | null
          default_inventory_account: string | null
          enable_perpetual_inventory: boolean
          expenses_included_in_valuation: string | null
          id: string
          name: string
          owner_id: string
          round_off_account: string | null
          round_off_cost_center: string | null
          stock_adjustment_account: string | null
          stock_received_but_not_billed: string | null
          write_off_account: string | null
        }
        Insert: {
          abbr: string
          cost_center?: string | null
          country_code: string
          created_at?: string
          default_bank_account?: string | null
          default_cash_account?: string | null
          default_currency: string
          default_expense_account?: string | null
          default_income_account?: string | null
          default_inventory_account?: string | null
          enable_perpetual_inventory?: boolean
          expenses_included_in_valuation?: string | null
          id?: string
          name: string
          owner_id: string
          round_off_account?: string | null
          round_off_cost_center?: string | null
          stock_adjustment_account?: string | null
          stock_received_but_not_billed?: string | null
          write_off_account?: string | null
        }
        Update: {
          abbr?: string
          cost_center?: string | null
          country_code?: string
          created_at?: string
          default_bank_account?: string | null
          default_cash_account?: string | null
          default_currency?: string
          default_expense_account?: string | null
          default_income_account?: string | null
          default_inventory_account?: string | null
          enable_perpetual_inventory?: boolean
          expenses_included_in_valuation?: string | null
          id?: string
          name?: string
          owner_id?: string
          round_off_account?: string | null
          round_off_cost_center?: string | null
          stock_adjustment_account?: string | null
          stock_received_but_not_billed?: string | null
          write_off_account?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchants_cost_center_fk"
            columns: ["cost_center", "id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_country_fk"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "merchants_default_bank_account_fk"
            columns: ["default_bank_account", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_default_cash_account_fk"
            columns: ["default_cash_account", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_default_currency_fk"
            columns: ["default_currency"]
            isOneToOne: false
            referencedRelation: "currency_presets"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "merchants_default_expense_account_fk"
            columns: ["default_expense_account", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_default_income_account_fk"
            columns: ["default_income_account", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_default_inventory_account_fk"
            columns: ["default_inventory_account", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_expenses_included_in_valuation_fk"
            columns: ["expenses_included_in_valuation", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_round_off_account_fk"
            columns: ["round_off_account", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_round_off_cost_center_fk"
            columns: ["round_off_cost_center", "id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_stock_adjustment_account_fk"
            columns: ["stock_adjustment_account", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_stock_received_but_not_billed_fk"
            columns: ["stock_received_but_not_billed", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "merchants_write_off_account_fk"
            columns: ["write_off_account", "id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      modes_of_payment: {
        Row: {
          created_at: string
          default_account: string | null
          enabled: boolean
          id: string
          merchant_id: string
          mode_of_payment: string
          type: string
        }
        Insert: {
          created_at?: string
          default_account?: string | null
          enabled?: boolean
          id?: string
          merchant_id: string
          mode_of_payment: string
          type?: string
        }
        Update: {
          created_at?: string
          default_account?: string | null
          enabled?: boolean
          id?: string
          merchant_id?: string
          mode_of_payment?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "modes_of_payment_account_fk"
            columns: ["default_account", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "modes_of_payment_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
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
      role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_read: boolean
          can_select: boolean
          can_write: boolean
          doctype: string
          id: string
          merchant_id: string
          role_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_select?: boolean
          can_write?: boolean
          doctype: string
          id?: string
          merchant_id: string
          role_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_select?: boolean
          can_write?: boolean
          doctype?: string
          id?: string
          merchant_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_doctype_fkey"
            columns: ["doctype"]
            isOneToOne: false
            referencedRelation: "doctypes"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "role_permissions_role_fk"
            columns: ["role_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      role_profile_roles: {
        Row: {
          merchant_id: string
          role_id: string
          role_profile_id: string
        }
        Insert: {
          merchant_id: string
          role_id: string
          role_profile_id: string
        }
        Update: {
          merchant_id?: string
          role_id?: string
          role_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_profile_roles_profile_fk"
            columns: ["role_profile_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "role_profiles"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "role_profile_roles_role_fk"
            columns: ["role_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      role_profiles: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          role_profile_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          role_profile_name: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          role_profile_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          disabled: boolean
          id: string
          is_standard: boolean
          merchant_id: string
          role_name: string
        }
        Insert: {
          created_at?: string
          disabled?: boolean
          id?: string
          is_standard?: boolean
          merchant_id: string
          role_name: string
        }
        Update: {
          created_at?: string
          disabled?: boolean
          id?: string
          is_standard?: boolean
          merchant_id?: string
          role_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_read: boolean
          can_select: boolean
          can_write: boolean
          doctype: string
          role_name: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_select?: boolean
          can_write?: boolean
          doctype: string
          role_name: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_select?: boolean
          can_write?: boolean
          doctype?: string
          role_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "standard_role_permissions_doctype_fkey"
            columns: ["doctype"]
            isOneToOne: false
            referencedRelation: "doctypes"
            referencedColumns: ["name"]
          },
        ]
      }
      system_settings: {
        Row: {
          currency_precision: number
          float_precision: number
          merchant_id: string
          number_format: string
          rounding_method: string
          time_zone: string
        }
        Insert: {
          currency_precision?: number
          float_precision?: number
          merchant_id: string
          number_format?: string
          rounding_method?: string
          time_zone: string
        }
        Update: {
          currency_precision?: number
          float_precision?: number
          merchant_id?: string
          number_format?: string
          rounding_method?: string
          time_zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          allow: string
          applicable_for: string | null
          apply_to_all_doctypes: boolean
          created_at: string
          for_value: string
          hide_descendants: boolean
          id: string
          is_default: boolean
          member_id: string
          merchant_id: string
        }
        Insert: {
          allow: string
          applicable_for?: string | null
          apply_to_all_doctypes?: boolean
          created_at?: string
          for_value: string
          hide_descendants?: boolean
          id?: string
          is_default?: boolean
          member_id: string
          merchant_id: string
        }
        Update: {
          allow?: string
          applicable_for?: string | null
          apply_to_all_doctypes?: boolean
          created_at?: string
          for_value?: string
          hide_descendants?: boolean
          id?: string
          is_default?: boolean
          member_id?: string
          merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_allow_fkey"
            columns: ["allow"]
            isOneToOne: false
            referencedRelation: "doctypes"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "user_permissions_applicable_for_fkey"
            columns: ["applicable_for"]
            isOneToOne: false
            referencedRelation: "doctypes"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "user_permissions_member_fk"
            columns: ["member_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_members"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_current_user: { Args: never; Returns: undefined }
      my_permissions: { Args: { p_merchant: string }; Returns: Json }
      save_member: { Args: { payload: Json }; Returns: string }
      save_role_permissions: {
        Args: { p_doctype: string; p_merchant: string; p_rows: Json }
        Returns: undefined
      }
      save_role_profile: { Args: { payload: Json }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
