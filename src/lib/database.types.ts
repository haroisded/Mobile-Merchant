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
      brands: {
        Row: {
          brand: string
          created_at: string
          default_price_list: string | null
          default_warehouse: string | null
          description: string | null
          id: string
          income_account: string | null
          merchant_id: string
          selling_cost_center: string | null
        }
        Insert: {
          brand: string
          created_at?: string
          default_price_list?: string | null
          default_warehouse?: string | null
          description?: string | null
          id?: string
          income_account?: string | null
          merchant_id: string
          selling_cost_center?: string | null
        }
        Update: {
          brand?: string
          created_at?: string
          default_price_list?: string | null
          default_warehouse?: string | null
          description?: string | null
          id?: string
          income_account?: string | null
          merchant_id?: string
          selling_cost_center?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_cost_center_fk"
            columns: ["selling_cost_center", "merchant_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "brands_income_account_fk"
            columns: ["income_account", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "brands_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_price_list_fk"
            columns: ["default_price_list", "merchant_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "brands_warehouse_fk"
            columns: ["default_warehouse", "merchant_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
      item_group_taxes: {
        Row: {
          id: string
          idx: number
          item_group_id: string
          item_tax_template_id: string
          maximum_net_rate: number
          merchant_id: string
          minimum_net_rate: number
          tax_category_id: string | null
          valid_from: string | null
        }
        Insert: {
          id?: string
          idx: number
          item_group_id: string
          item_tax_template_id: string
          maximum_net_rate?: number
          merchant_id: string
          minimum_net_rate?: number
          tax_category_id?: string | null
          valid_from?: string | null
        }
        Update: {
          id?: string
          idx?: number
          item_group_id?: string
          item_tax_template_id?: string
          maximum_net_rate?: number
          merchant_id?: string
          minimum_net_rate?: number
          tax_category_id?: string | null
          valid_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_group_taxes_category_fk"
            columns: ["tax_category_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_group_taxes_group_fk"
            columns: ["item_group_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "item_groups"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_group_taxes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_group_taxes_template_fk"
            columns: ["item_tax_template_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "item_tax_templates"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      item_groups: {
        Row: {
          created_at: string
          default_price_list: string | null
          default_warehouse: string | null
          expense_account: string | null
          id: string
          income_account: string | null
          is_group: boolean
          item_group_name: string
          merchant_id: string
          parent_id: string | null
          selling_cost_center: string | null
        }
        Insert: {
          created_at?: string
          default_price_list?: string | null
          default_warehouse?: string | null
          expense_account?: string | null
          id?: string
          income_account?: string | null
          is_group?: boolean
          item_group_name: string
          merchant_id: string
          parent_id?: string | null
          selling_cost_center?: string | null
        }
        Update: {
          created_at?: string
          default_price_list?: string | null
          default_warehouse?: string | null
          expense_account?: string | null
          id?: string
          income_account?: string | null
          is_group?: boolean
          item_group_name?: string
          merchant_id?: string
          parent_id?: string | null
          selling_cost_center?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_groups_cost_center_fk"
            columns: ["selling_cost_center", "merchant_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_groups_expense_account_fk"
            columns: ["expense_account", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_groups_income_account_fk"
            columns: ["income_account", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_groups_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_groups_parent_fk"
            columns: ["parent_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "item_groups"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_groups_price_list_fk"
            columns: ["default_price_list", "merchant_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_groups_warehouse_fk"
            columns: ["default_warehouse", "merchant_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      item_prices: {
        Row: {
          created_at: string
          id: string
          item_id: string
          merchant_id: string
          price_list_id: string
          price_list_rate: number
          uom_id: string
          valid_from: string | null
          valid_upto: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          merchant_id: string
          price_list_id: string
          price_list_rate: number
          uom_id: string
          valid_from?: string | null
          valid_upto?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          merchant_id?: string
          price_list_id?: string
          price_list_rate?: number
          uom_id?: string
          valid_from?: string | null
          valid_upto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_prices_item_fk"
            columns: ["item_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_prices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_prices_price_list_fk"
            columns: ["price_list_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_prices_uom_fk"
            columns: ["uom_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      item_tax_template_rows: {
        Row: {
          account: string
          id: string
          idx: number
          merchant_id: string
          not_applicable: boolean
          tax_rate: number
          template_id: string
        }
        Insert: {
          account: string
          id?: string
          idx: number
          merchant_id: string
          not_applicable?: boolean
          tax_rate?: number
          template_id: string
        }
        Update: {
          account?: string
          id?: string
          idx?: number
          merchant_id?: string
          not_applicable?: boolean
          tax_rate?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_tax_template_rows_account_fk"
            columns: ["account", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_tax_template_rows_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_tax_template_rows_template_fk"
            columns: ["template_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "item_tax_templates"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      item_tax_templates: {
        Row: {
          created_at: string
          disabled: boolean
          id: string
          merchant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          disabled?: boolean
          id?: string
          merchant_id: string
          title: string
        }
        Update: {
          created_at?: string
          disabled?: boolean
          id?: string
          merchant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_tax_templates_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_taxes: {
        Row: {
          id: string
          idx: number
          item_id: string
          item_tax_template_id: string
          merchant_id: string
          tax_category_id: string | null
          valid_from: string | null
        }
        Insert: {
          id?: string
          idx: number
          item_id: string
          item_tax_template_id: string
          merchant_id: string
          tax_category_id?: string | null
          valid_from?: string | null
        }
        Update: {
          id?: string
          idx?: number
          item_id?: string
          item_tax_template_id?: string
          merchant_id?: string
          tax_category_id?: string | null
          valid_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_taxes_category_fk"
            columns: ["tax_category_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_taxes_item_fk"
            columns: ["item_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_taxes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_taxes_template_fk"
            columns: ["item_tax_template_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "item_tax_templates"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      item_uoms: {
        Row: {
          conversion_factor: number
          id: string
          idx: number
          item_id: string
          merchant_id: string
          uom_id: string
        }
        Insert: {
          conversion_factor: number
          id?: string
          idx: number
          item_id: string
          merchant_id: string
          uom_id: string
        }
        Update: {
          conversion_factor?: number
          id?: string
          idx?: number
          item_id?: string
          merchant_id?: string
          uom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_uoms_item_fk"
            columns: ["item_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "item_uoms_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_uoms_uom_fk"
            columns: ["uom_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      items: {
        Row: {
          allow_negative_stock: boolean
          brand_id: string | null
          created_at: string
          default_price_list: string | null
          default_warehouse: string | null
          description: string | null
          disabled: boolean
          expense_account: string | null
          id: string
          income_account: string | null
          is_stock_item: boolean
          item_code: string
          item_group_id: string
          item_name: string
          merchant_id: string
          reorder_level: number | null
          sales_uom: string | null
          selling_cost_center: string | null
          stock_uom: string
          valuation_method: string | null
        }
        Insert: {
          allow_negative_stock?: boolean
          brand_id?: string | null
          created_at?: string
          default_price_list?: string | null
          default_warehouse?: string | null
          description?: string | null
          disabled?: boolean
          expense_account?: string | null
          id?: string
          income_account?: string | null
          is_stock_item?: boolean
          item_code: string
          item_group_id: string
          item_name: string
          merchant_id: string
          reorder_level?: number | null
          sales_uom?: string | null
          selling_cost_center?: string | null
          stock_uom: string
          valuation_method?: string | null
        }
        Update: {
          allow_negative_stock?: boolean
          brand_id?: string | null
          created_at?: string
          default_price_list?: string | null
          default_warehouse?: string | null
          description?: string | null
          disabled?: boolean
          expense_account?: string | null
          id?: string
          income_account?: string | null
          is_stock_item?: boolean
          item_code?: string
          item_group_id?: string
          item_name?: string
          merchant_id?: string
          reorder_level?: number | null
          sales_uom?: string | null
          selling_cost_center?: string | null
          stock_uom?: string
          valuation_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_brand_fk"
            columns: ["brand_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "items_cost_center_fk"
            columns: ["selling_cost_center", "merchant_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "items_expense_account_fk"
            columns: ["expense_account", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "items_income_account_fk"
            columns: ["income_account", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "items_item_group_fk"
            columns: ["item_group_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "item_groups"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_price_list_fk"
            columns: ["default_price_list", "merchant_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "items_sales_uom_fk"
            columns: ["sales_uom", "merchant_id"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "items_stock_uom_fk"
            columns: ["stock_uom", "merchant_id"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "items_warehouse_fk"
            columns: ["default_warehouse", "merchant_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      letter_heads: {
        Row: {
          content: string
          created_at: string
          disabled: boolean
          footer: string
          id: string
          is_default: boolean
          letter_head_name: string
          merchant_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          disabled?: boolean
          footer?: string
          id?: string
          is_default?: boolean
          letter_head_name: string
          merchant_id: string
        }
        Update: {
          content?: string
          created_at?: string
          disabled?: boolean
          footer?: string
          id?: string
          is_default?: boolean
          letter_head_name?: string
          merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_heads_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
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
      naming_series: {
        Row: {
          document_type: string
          merchant_id: string
          options: string[]
          user_must_select: boolean
        }
        Insert: {
          document_type: string
          merchant_id: string
          options: string[]
          user_must_select?: boolean
        }
        Update: {
          document_type?: string
          merchant_id?: string
          options?: string[]
          user_must_select?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "naming_series_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      naming_series_counters: {
        Row: {
          current_value: number
          merchant_id: string
          prefix: string
        }
        Insert: {
          current_value?: number
          merchant_id: string
          prefix: string
        }
        Update: {
          current_value?: number
          merchant_id?: string
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "naming_series_counters_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          created_at: string
          currency: string
          enabled: boolean
          id: string
          merchant_id: string
          price_list_name: string
          price_not_uom_dependent: boolean
        }
        Insert: {
          created_at?: string
          currency: string
          enabled?: boolean
          id?: string
          merchant_id: string
          price_list_name: string
          price_not_uom_dependent?: boolean
        }
        Update: {
          created_at?: string
          currency?: string
          enabled?: boolean
          id?: string
          merchant_id?: string
          price_list_name?: string
          price_not_uom_dependent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "price_lists_currency_fk"
            columns: ["merchant_id", "currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["merchant_id", "code"]
          },
          {
            foreignKeyName: "price_lists_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_formats: {
        Row: {
          created_at: string
          disabled: boolean
          footer_note: string
          id: string
          is_default: boolean
          merchant_id: string
          paper: string
          print_format_name: string
          print_heading: string
          show_item_code: boolean
        }
        Insert: {
          created_at?: string
          disabled?: boolean
          footer_note?: string
          id?: string
          is_default?: boolean
          merchant_id: string
          paper?: string
          print_format_name: string
          print_heading?: string
          show_item_code?: boolean
        }
        Update: {
          created_at?: string
          disabled?: boolean
          footer_note?: string
          id?: string
          is_default?: boolean
          merchant_id?: string
          paper?: string
          print_format_name?: string
          print_heading?: string
          show_item_code?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "print_formats_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      print_settings: {
        Row: {
          compact_item_print: boolean
          merchant_id: string
          print_taxes_with_zero_amount: boolean
          with_letterhead: boolean
        }
        Insert: {
          compact_item_print?: boolean
          merchant_id: string
          print_taxes_with_zero_amount?: boolean
          with_letterhead?: boolean
        }
        Update: {
          compact_item_print?: boolean
          merchant_id?: string
          print_taxes_with_zero_amount?: boolean
          with_letterhead?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "print_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
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
      sales_tax_template_rows: {
        Row: {
          account: string
          charge_type: string
          cost_center: string | null
          description: string
          id: string
          idx: number
          included_in_print_rate: boolean
          merchant_id: string
          rate: number
          row_id: number | null
          tax_amount: number
          template_id: string
        }
        Insert: {
          account: string
          charge_type: string
          cost_center?: string | null
          description: string
          id?: string
          idx: number
          included_in_print_rate?: boolean
          merchant_id: string
          rate?: number
          row_id?: number | null
          tax_amount?: number
          template_id: string
        }
        Update: {
          account?: string
          charge_type?: string
          cost_center?: string | null
          description?: string
          id?: string
          idx?: number
          included_in_print_rate?: boolean
          merchant_id?: string
          rate?: number
          row_id?: number | null
          tax_amount?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_tax_template_rows_account_fk"
            columns: ["account", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "sales_tax_template_rows_cost_center_fk"
            columns: ["cost_center", "merchant_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "sales_tax_template_rows_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tax_template_rows_template_fk"
            columns: ["template_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "sales_tax_templates"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      sales_tax_templates: {
        Row: {
          created_at: string
          disabled: boolean
          id: string
          is_default: boolean
          merchant_id: string
          tax_category_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          disabled?: boolean
          id?: string
          is_default?: boolean
          merchant_id: string
          tax_category_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          disabled?: boolean
          id?: string
          is_default?: boolean
          merchant_id?: string
          tax_category_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_tax_templates_category_fk"
            columns: ["tax_category_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "sales_tax_templates_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      selling_settings: {
        Row: {
          default_price_list: string | null
          editable_price_list_rate: boolean
          fallback_to_default_price_list: boolean
          merchant_id: string
          validate_selling_price: boolean
        }
        Insert: {
          default_price_list?: string | null
          editable_price_list_rate?: boolean
          fallback_to_default_price_list?: boolean
          merchant_id: string
          validate_selling_price?: boolean
        }
        Update: {
          default_price_list?: string | null
          editable_price_list_rate?: boolean
          fallback_to_default_price_list?: boolean
          merchant_id?: string
          validate_selling_price?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "selling_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selling_settings_price_list_fk"
            columns: ["default_price_list", "merchant_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id", "merchant_id"]
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
      stock_settings: {
        Row: {
          allow_negative_stock: boolean
          auto_insert_price_list_rate_if_missing: boolean
          default_warehouse: string | null
          item_group: string | null
          item_naming_by: string
          merchant_id: string
          stock_uom: string | null
          valuation_method: string
        }
        Insert: {
          allow_negative_stock?: boolean
          auto_insert_price_list_rate_if_missing?: boolean
          default_warehouse?: string | null
          item_group?: string | null
          item_naming_by?: string
          merchant_id: string
          stock_uom?: string | null
          valuation_method?: string
        }
        Update: {
          allow_negative_stock?: boolean
          auto_insert_price_list_rate_if_missing?: boolean
          default_warehouse?: string | null
          item_group?: string | null
          item_naming_by?: string
          merchant_id?: string
          stock_uom?: string | null
          valuation_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_settings_item_group_fk"
            columns: ["item_group", "merchant_id"]
            isOneToOne: false
            referencedRelation: "item_groups"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "stock_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_settings_uom_fk"
            columns: ["stock_uom", "merchant_id"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "stock_settings_warehouse_fk"
            columns: ["default_warehouse", "merchant_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "merchant_id"]
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
      tax_categories: {
        Row: {
          created_at: string
          disabled: boolean
          id: string
          merchant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          disabled?: boolean
          id?: string
          merchant_id: string
          title: string
        }
        Update: {
          created_at?: string
          disabled?: boolean
          id?: string
          merchant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_presets: {
        Row: {
          account_name: string
          country_code: string
          is_default: boolean
          tax_rate: number
          template: string
        }
        Insert: {
          account_name: string
          country_code: string
          is_default?: boolean
          tax_rate: number
          template: string
        }
        Update: {
          account_name?: string
          country_code?: string
          is_default?: boolean
          tax_rate?: number
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_presets_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      tax_rules: {
        Row: {
          created_at: string
          from_date: string | null
          id: string
          item_group_id: string | null
          merchant_id: string
          priority: number
          sales_tax_template_id: string
          tax_category_id: string | null
          to_date: string | null
        }
        Insert: {
          created_at?: string
          from_date?: string | null
          id?: string
          item_group_id?: string | null
          merchant_id: string
          priority?: number
          sales_tax_template_id: string
          tax_category_id?: string | null
          to_date?: string | null
        }
        Update: {
          created_at?: string
          from_date?: string | null
          id?: string
          item_group_id?: string | null
          merchant_id?: string
          priority?: number
          sales_tax_template_id?: string
          tax_category_id?: string | null
          to_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rules_category_fk"
            columns: ["tax_category_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "tax_rules_item_group_fk"
            columns: ["item_group_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "item_groups"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "tax_rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rules_template_fk"
            columns: ["sales_tax_template_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "sales_tax_templates"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      uom_conversion_factors: {
        Row: {
          created_at: string
          from_uom: string
          id: string
          merchant_id: string
          to_uom: string
          value: number
        }
        Insert: {
          created_at?: string
          from_uom: string
          id?: string
          merchant_id: string
          to_uom: string
          value: number
        }
        Update: {
          created_at?: string
          from_uom?: string
          id?: string
          merchant_id?: string
          to_uom?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "uom_conversion_factors_from_fk"
            columns: ["from_uom", "merchant_id"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "uom_conversion_factors_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uom_conversion_factors_to_fk"
            columns: ["to_uom", "merchant_id"]
            isOneToOne: false
            referencedRelation: "uoms"
            referencedColumns: ["id", "merchant_id"]
          },
        ]
      }
      uoms: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          merchant_id: string
          must_be_whole_number: boolean
          uom_name: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          merchant_id: string
          must_be_whole_number?: boolean
          uom_name: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          merchant_id?: string
          must_be_whole_number?: boolean
          uom_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "uoms_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
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
      warehouses: {
        Row: {
          account: string | null
          created_at: string
          disabled: boolean
          id: string
          is_group: boolean
          merchant_id: string
          parent_id: string | null
          warehouse_name: string
        }
        Insert: {
          account?: string | null
          created_at?: string
          disabled?: boolean
          id?: string
          is_group?: boolean
          merchant_id: string
          parent_id?: string | null
          warehouse_name: string
        }
        Update: {
          account?: string | null
          created_at?: string
          disabled?: boolean
          id?: string
          is_group?: boolean
          merchant_id?: string
          parent_id?: string | null
          warehouse_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_account_fk"
            columns: ["account", "merchant_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "merchant_id"]
          },
          {
            foreignKeyName: "warehouses_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_parent_fk"
            columns: ["parent_id", "merchant_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
      naming_series_preview: {
        Args: { p_merchant: string }
        Returns: {
          current_value: number
          document_type: string
          next_name: string
          prefix: string
          series: string
        }[]
      }
      save_item: { Args: { payload: Json }; Returns: string }
      save_item_group: { Args: { payload: Json }; Returns: string }
      save_item_tax_template: { Args: { payload: Json }; Returns: string }
      save_member: { Args: { payload: Json }; Returns: string }
      save_role_permissions: {
        Args: { p_doctype: string; p_merchant: string; p_rows: Json }
        Returns: undefined
      }
      save_role_profile: { Args: { payload: Json }; Returns: string }
      save_sales_tax_template: { Args: { payload: Json }; Returns: string }
      update_series_counter: {
        Args: { p_current: number; p_merchant: string; p_series: string }
        Returns: undefined
      }
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
