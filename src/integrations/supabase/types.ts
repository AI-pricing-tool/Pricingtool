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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          organisation_id: string | null
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organisation_id?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organisation_id?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      buy_rates: {
        Row: {
          canonical_category_id: string | null
          card_present: boolean | null
          created_at: string
          effective_from: string
          fee_category_id: string | null
          id: string
          monthly_fee: number | null
          per_item: number | null
          percent_rate: number | null
        }
        Insert: {
          canonical_category_id?: string | null
          card_present?: boolean | null
          created_at?: string
          effective_from?: string
          fee_category_id?: string | null
          id?: string
          monthly_fee?: number | null
          per_item?: number | null
          percent_rate?: number | null
        }
        Update: {
          canonical_category_id?: string | null
          card_present?: boolean | null
          created_at?: string
          effective_from?: string
          fee_category_id?: string | null
          id?: string
          monthly_fee?: number | null
          per_item?: number | null
          percent_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "buy_rates_canonical_category_id_fkey"
            columns: ["canonical_category_id"]
            isOneToOne: false
            referencedRelation: "canonical_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_rates_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_categories: {
        Row: {
          card_category: Database["public"]["Enums"]["card_category"] | null
          code: string
          created_at: string
          funding: Database["public"]["Enums"]["card_funding"] | null
          id: string
          label: string
          region: Database["public"]["Enums"]["region_code"] | null
          scheme: Database["public"]["Enums"]["card_scheme"] | null
          sort_order: number | null
        }
        Insert: {
          card_category?: Database["public"]["Enums"]["card_category"] | null
          code: string
          created_at?: string
          funding?: Database["public"]["Enums"]["card_funding"] | null
          id?: string
          label: string
          region?: Database["public"]["Enums"]["region_code"] | null
          scheme?: Database["public"]["Enums"]["card_scheme"] | null
          sort_order?: number | null
        }
        Update: {
          card_category?: Database["public"]["Enums"]["card_category"] | null
          code?: string
          created_at?: string
          funding?: Database["public"]["Enums"]["card_funding"] | null
          id?: string
          label?: string
          region?: Database["public"]["Enums"]["region_code"] | null
          scheme?: Database["public"]["Enums"]["card_scheme"] | null
          sort_order?: number | null
        }
        Relationships: []
      }
      fee_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          label: string
          unit: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          unit?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          unit?: string
        }
        Relationships: []
      }
      forecast_overrides: {
        Row: {
          created_at: string
          id: string
          month: string
          reseller_id: string
          stream: Database["public"]["Enums"]["forecast_stream"]
          updated_at: string
          updated_by: string | null
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          reseller_id: string
          stream: Database["public"]["Enums"]["forecast_stream"]
          updated_at?: string
          updated_by?: string | null
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          reseller_id?: string
          stream?: Database["public"]["Enums"]["forecast_stream"]
          updated_at?: string
          updated_by?: string | null
          value?: number
        }
        Relationships: []
      }
      forecast_versions: {
        Row: {
          annual_total_2026: number
          author: string
          created_at: string
          created_by: string | null
          id: string
          method: string
          notes: string
          reseller_id: string
        }
        Insert: {
          annual_total_2026?: number
          author: string
          created_at?: string
          created_by?: string | null
          id?: string
          method: string
          notes?: string
          reseller_id: string
        }
        Update: {
          annual_total_2026?: number
          author?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          notes?: string
          reseller_id?: string
        }
        Relationships: []
      }
      growth_actions: {
        Row: {
          created_at: string
          created_by: string | null
          due: string
          id: string
          monthly_uplift: number
          notes: string
          owner: string
          reseller_id: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due?: string
          id?: string
          monthly_uplift?: number
          notes?: string
          owner?: string
          reseller_id: string
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due?: string
          id?: string
          monthly_uplift?: number
          notes?: string
          owner?: string
          reseller_id?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      mapping_dictionary: {
        Row: {
          acquirer: string
          canonical_category_id: string | null
          confidence: number
          created_at: string
          fee_category_id: string | null
          id: string
          raw_description: string
          raw_description_normalized: string | null
          source: string
          updated_at: string
          usage_count: number
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          acquirer: string
          canonical_category_id?: string | null
          confidence?: number
          created_at?: string
          fee_category_id?: string | null
          id?: string
          raw_description: string
          raw_description_normalized?: string | null
          source?: string
          updated_at?: string
          usage_count?: number
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          acquirer?: string
          canonical_category_id?: string | null
          confidence?: number
          created_at?: string
          fee_category_id?: string | null
          id?: string
          raw_description?: string
          raw_description_normalized?: string | null
          source?: string
          updated_at?: string
          usage_count?: number
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mapping_dictionary_canonical_category_id_fkey"
            columns: ["canonical_category_id"]
            isOneToOne: false
            referencedRelation: "canonical_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapping_dictionary_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          acquirer: string | null
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          mid: string | null
          monthly_transactions: number | null
          monthly_volume: number | null
          name: string
          organisation_id: string
          stage: Database["public"]["Enums"]["merchant_stage"]
          updated_at: string
        }
        Insert: {
          acquirer?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          mid?: string | null
          monthly_transactions?: number | null
          monthly_volume?: number | null
          name: string
          organisation_id: string
          stage?: Database["public"]["Enums"]["merchant_stage"]
          updated_at?: string
        }
        Update: {
          acquirer?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          mid?: string | null
          monthly_transactions?: number | null
          monthly_volume?: number | null
          name?: string
          organisation_id?: string
          stage?: Database["public"]["Enums"]["merchant_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchants_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          brand_color: string | null
          created_at: string
          id: string
          is_super: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          created_at?: string
          id?: string
          is_super?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          created_at?: string
          id?: string
          is_super?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          organisation_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          organisation_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organisation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          payload: Json
          proposal_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          payload: Json
          proposal_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          payload?: Json
          proposal_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          created_at: string
          created_by: string | null
          estimated_annual_saving: number | null
          estimated_monthly_saving: number | null
          estimated_reseller_revenue: number | null
          file_path: string | null
          id: string
          merchant_id: string
          organisation_id: string
          payload: Json | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimated_annual_saving?: number | null
          estimated_monthly_saving?: number | null
          estimated_reseller_revenue?: number | null
          file_path?: string | null
          id?: string
          merchant_id: string
          organisation_id: string
          payload?: Json | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimated_annual_saving?: number | null
          estimated_monthly_saving?: number | null
          estimated_reseller_revenue?: number | null
          file_path?: string | null
          id?: string
          merchant_id?: string
          organisation_id?: string
          payload?: Json | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_rates: {
        Row: {
          canonical_category_id: string | null
          created_at: string
          fee_category_id: string | null
          id: string
          margin_uplift: number | null
          merchant_id: string | null
          monthly_fee: number | null
          organisation_id: string
          per_item: number | null
          percent_rate: number | null
        }
        Insert: {
          canonical_category_id?: string | null
          created_at?: string
          fee_category_id?: string | null
          id?: string
          margin_uplift?: number | null
          merchant_id?: string | null
          monthly_fee?: number | null
          organisation_id: string
          per_item?: number | null
          percent_rate?: number | null
        }
        Update: {
          canonical_category_id?: string | null
          created_at?: string
          fee_category_id?: string | null
          id?: string
          margin_uplift?: number | null
          merchant_id?: string | null
          monthly_fee?: number | null
          organisation_id?: string
          per_item?: number | null
          percent_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_rates_canonical_category_id_fkey"
            columns: ["canonical_category_id"]
            isOneToOne: false
            referencedRelation: "canonical_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_rates_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_rates_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_rates_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      semantic_tokens: {
        Row: {
          context: string | null
          created_at: string
          expansion: string
          id: string
          token: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          expansion: string
          id?: string
          token: string
        }
        Update: {
          context?: string | null
          created_at?: string
          expansion?: string
          id?: string
          token?: string
        }
        Relationships: []
      }
      statement_lines: {
        Row: {
          acquirer: string | null
          canonical_category_id: string | null
          confidence: number | null
          created_at: string
          extracted_fee: number | null
          fee_category_id: string | null
          id: string
          notes: string | null
          organisation_id: string
          our_fee: number | null
          our_per_txn: number | null
          our_rate: number | null
          raw_description: string
          raw_rate: number | null
          site_mid: string | null
          site_name: string | null
          statement_id: string
          status: Database["public"]["Enums"]["line_status"]
          txn_count: number | null
          txn_value: number | null
          updated_at: string
        }
        Insert: {
          acquirer?: string | null
          canonical_category_id?: string | null
          confidence?: number | null
          created_at?: string
          extracted_fee?: number | null
          fee_category_id?: string | null
          id?: string
          notes?: string | null
          organisation_id: string
          our_fee?: number | null
          our_per_txn?: number | null
          our_rate?: number | null
          raw_description: string
          raw_rate?: number | null
          site_mid?: string | null
          site_name?: string | null
          statement_id: string
          status?: Database["public"]["Enums"]["line_status"]
          txn_count?: number | null
          txn_value?: number | null
          updated_at?: string
        }
        Update: {
          acquirer?: string | null
          canonical_category_id?: string | null
          confidence?: number | null
          created_at?: string
          extracted_fee?: number | null
          fee_category_id?: string | null
          id?: string
          notes?: string | null
          organisation_id?: string
          our_fee?: number | null
          our_per_txn?: number | null
          our_rate?: number | null
          raw_description?: string
          raw_rate?: number | null
          site_mid?: string | null
          site_name?: string | null
          statement_id?: string
          status?: Database["public"]["Enums"]["line_status"]
          txn_count?: number | null
          txn_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_lines_canonical_category_id_fkey"
            columns: ["canonical_category_id"]
            isOneToOne: false
            referencedRelation: "canonical_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_lines_fee_category_id_fkey"
            columns: ["fee_category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_lines_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
        ]
      }
      statements: {
        Row: {
          acquirer: string | null
          archived_at: string | null
          confidence_score: number | null
          created_at: string
          currency: string
          error_message: string | null
          file_name: string | null
          file_path: string | null
          file_type: string | null
          id: string
          merchant_id: string | null
          notes: string | null
          organisation_id: string
          period_end: string | null
          period_start: string | null
          status: Database["public"]["Enums"]["statement_status"]
          total_fees: number | null
          total_volume: number | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          acquirer?: string | null
          archived_at?: string | null
          confidence_score?: number | null
          created_at?: string
          currency?: string
          error_message?: string | null
          file_name?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          merchant_id?: string | null
          notes?: string | null
          organisation_id: string
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["statement_status"]
          total_fees?: number | null
          total_volume?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          acquirer?: string | null
          archived_at?: string | null
          confidence_score?: number | null
          created_at?: string
          currency?: string
          error_message?: string | null
          file_name?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          merchant_id?: string | null
          notes?: string | null
          organisation_id?: string
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["statement_status"]
          total_fees?: number | null
          total_volume?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "statements_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organisation_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organisation_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organisation_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_set_user_org_and_role: {
        Args: {
          p_org_id: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      create_organisation_for_current_user: {
        Args: { p_name: string }
        Returns: string
      }
      current_org_id: { Args: never; Returns: string }
      current_org_slug: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "reseller" | "viewer"
      card_category: "consumer" | "business" | "commercial" | "corporate"
      card_funding: "debit" | "credit" | "prepaid" | "unknown"
      card_scheme: "visa" | "mastercard" | "amex" | "other" | "discover"
      forecast_stream:
        | "reseller_turnover"
        | "reseller_commission"
        | "vesta_turnover"
        | "vesta_commission"
      line_status: "unmapped" | "suggested" | "approved" | "manual"
      merchant_stage:
        | "creating_proposal"
        | "proposed"
        | "contract_sent"
        | "contract_signed"
        | "onboarding"
        | "implementation"
        | "live"
        | "lost"
      region_code: "uk" | "eu" | "non_eu" | "intra" | "inter" | "us"
      statement_status:
        | "uploaded"
        | "processing"
        | "extracted"
        | "reviewed"
        | "failed"
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
      app_role: ["super_admin", "reseller", "viewer"],
      card_category: ["consumer", "business", "commercial", "corporate"],
      card_funding: ["debit", "credit", "prepaid", "unknown"],
      card_scheme: ["visa", "mastercard", "amex", "other", "discover"],
      forecast_stream: [
        "reseller_turnover",
        "reseller_commission",
        "vesta_turnover",
        "vesta_commission",
      ],
      line_status: ["unmapped", "suggested", "approved", "manual"],
      merchant_stage: [
        "creating_proposal",
        "proposed",
        "contract_sent",
        "contract_signed",
        "onboarding",
        "implementation",
        "live",
        "lost",
      ],
      region_code: ["uk", "eu", "non_eu", "intra", "inter", "us"],
      statement_status: [
        "uploaded",
        "processing",
        "extracted",
        "reviewed",
        "failed",
      ],
    },
  },
} as const
