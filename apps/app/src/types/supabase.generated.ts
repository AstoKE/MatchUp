export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      cities: {
        Row: {
          country_code: string;
          id: string;
          is_active: boolean;
          names: NonNullable<Json>;
          slug: string;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          country_code: string;
          id?: string;
          is_active?: boolean;
          names: NonNullable<Json>;
          slug: string;
          timezone: string;
        };
        Update: {
          country_code?: string;
          id?: string;
          is_active?: boolean;
          names?: NonNullable<Json>;
          slug?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      districts: {
        Row: {
          city_id: string;
          id: string;
          is_active: boolean;
          names: NonNullable<Json>;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          city_id: string;
          id?: string;
          is_active?: boolean;
          names: NonNullable<Json>;
          slug: string;
        };
        Update: {
          city_id?: string;
          id?: string;
          is_active?: boolean;
          names?: NonNullable<Json>;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'districts_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
        ];
      };
      platform_admins: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          revoked_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_admins_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          account_status: Database['public']['Enums']['account_status'];
          adult_confirmed_at: string | null;
          avatar_path: string | null;
          bio: string | null;
          city_id: string | null;
          created_at: string;
          deletion_requested_at: string | null;
          display_name: string | null;
          district_id: string | null;
          id: string;
          onboarded_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_status?: Database['public']['Enums']['account_status'];
          adult_confirmed_at?: string | null;
          avatar_path?: string | null;
          bio?: string | null;
          city_id?: string | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          district_id?: string | null;
          id: string;
          onboarded_at?: string | null;
          updated_at?: string;
        };
        Update: {
          account_status?: Database['public']['Enums']['account_status'];
          adult_confirmed_at?: string | null;
          avatar_path?: string | null;
          bio?: string | null;
          city_id?: string | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          district_id?: string | null;
          id?: string;
          onboarded_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_district_matches_city';
            columns: ['district_id', 'city_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id', 'city_id'];
          },
        ];
      };
      sport_formats: {
        Row: {
          default_capacity: number;
          id: string;
          is_active: boolean;
          is_flexible: boolean;
          max_participants: number;
          min_participants: number;
          names: NonNullable<Json>;
          slug: string;
          sort_order: number;
          sport_id: string;
        };
        ComputedFields: never;
        Insert: {
          default_capacity: number;
          id?: string;
          is_active?: boolean;
          is_flexible?: boolean;
          max_participants: number;
          min_participants: number;
          names: NonNullable<Json>;
          slug: string;
          sort_order?: number;
          sport_id: string;
        };
        Update: {
          default_capacity?: number;
          id?: string;
          is_active?: boolean;
          is_flexible?: boolean;
          max_participants?: number;
          min_participants?: number;
          names?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
          sport_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sport_formats_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      sport_positions: {
        Row: {
          id: string;
          is_active: boolean;
          names: NonNullable<Json>;
          slug: string;
          sort_order: number;
          sport_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          is_active?: boolean;
          names: NonNullable<Json>;
          slug: string;
          sort_order?: number;
          sport_id: string;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          names?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
          sport_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sport_positions_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      sports: {
        Row: {
          created_at: string;
          icon_key: string;
          id: string;
          is_active: boolean;
          is_team_sport: boolean;
          names: NonNullable<Json>;
          settings: NonNullable<Json>;
          skill_descriptors: NonNullable<Json>;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          icon_key: string;
          id?: string;
          is_active?: boolean;
          is_team_sport: boolean;
          names: NonNullable<Json>;
          settings?: NonNullable<Json>;
          skill_descriptors: NonNullable<Json>;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          icon_key?: string;
          id?: string;
          is_active?: boolean;
          is_team_sport?: boolean;
          names?: NonNullable<Json>;
          settings?: NonNullable<Json>;
          skill_descriptors?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_consents: {
        Row: {
          granted_at: string;
          id: string;
          kind: Database['public']['Enums']['consent_kind'];
          revoked_at: string | null;
          user_id: string;
          version: string;
        };
        ComputedFields: never;
        Insert: {
          granted_at?: string;
          id?: string;
          kind: Database['public']['Enums']['consent_kind'];
          revoked_at?: string | null;
          user_id: string;
          version: string;
        };
        Update: {
          granted_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['consent_kind'];
          revoked_at?: string | null;
          user_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_consents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_settings: {
        Row: {
          created_at: string;
          locale: string;
          marketing_consent_at: string | null;
          profile_visibility: Database['public']['Enums']['profile_visibility'];
          show_badges: boolean;
          show_reliability: boolean;
          theme: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          locale?: string;
          marketing_consent_at?: string | null;
          profile_visibility?: Database['public']['Enums']['profile_visibility'];
          show_badges?: boolean;
          show_reliability?: boolean;
          theme?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          locale?: string;
          marketing_consent_at?: string | null;
          profile_visibility?: Database['public']['Enums']['profile_visibility'];
          show_badges?: boolean;
          show_reliability?: boolean;
          theme?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_sport_positions: {
        Row: {
          position_id: string;
          sport_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          position_id: string;
          sport_id: string;
          user_id: string;
        };
        Update: {
          position_id?: string;
          sport_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_sport_positions_position_id_sport_id_fkey';
            columns: ['position_id', 'sport_id'];
            isOneToOne: false;
            referencedRelation: 'sport_positions';
            referencedColumns: ['id', 'sport_id'];
          },
          {
            foreignKeyName: 'user_sport_positions_user_id_sport_id_fkey';
            columns: ['user_id', 'sport_id'];
            isOneToOne: false;
            referencedRelation: 'user_sport_profiles';
            referencedColumns: ['user_id', 'sport_id'];
          },
        ];
      };
      user_sport_profiles: {
        Row: {
          created_at: string;
          self_assessed_at: string;
          self_assessed_level: number;
          sport_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          self_assessed_at?: string;
          self_assessed_level: number;
          sport_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          self_assessed_at?: string;
          self_assessed_level?: number;
          sport_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_sport_profiles_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_sport_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_current_legal_terms: {
        Args: { p_privacy_version: string; p_terms_version: string };
        Returns: undefined;
      };
      cancel_account_deletion: { Args: Record<PropertyKey, never>; Returns: undefined };
      complete_onboarding: {
        Args: {
          p_adult_confirmed: boolean;
          p_city_id: string;
          p_display_name: string;
          p_district_id: string;
          p_marketing_consent: boolean;
          p_privacy_version: string;
          p_sports: Json;
          p_terms_version: string;
        };
        Returns: undefined;
      };
      export_my_data: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_account: {
        Args: Record<PropertyKey, never>;
        Returns: {
          account_status: Database['public']['Enums']['account_status'];
          adult_confirmed: boolean;
          deletion_due_at: string;
          email_verified: boolean;
          is_admin: boolean;
          legal_consent_current: boolean;
          onboarded: boolean;
          user_id: string;
        }[];
      };
      remove_sport_profile: { Args: { p_sport_id: string }; Returns: undefined };
      replace_my_sport_profiles: { Args: { p_sports: Json }; Returns: undefined };
      request_account_deletion: { Args: Record<PropertyKey, never>; Returns: string };
      set_marketing_consent: { Args: { p_granted: boolean }; Returns: undefined };
      set_sport_profile: {
        Args: { p_level: number; p_position_ids: string[]; p_sport_id: string };
        Returns: undefined;
      };
      update_my_profile: {
        Args: { p_bio: string; p_city_id: string; p_display_name: string; p_district_id: string };
        Returns: undefined;
      };
      update_my_settings: {
        Args: {
          p_locale: string;
          p_profile_visibility: Database['public']['Enums']['profile_visibility'];
          p_show_badges: boolean;
          p_show_reliability: boolean;
          p_theme: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      account_status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED';
      consent_kind: 'TERMS' | 'PRIVACY_NOTICE' | 'MARKETING';
      profile_visibility: 'EVERYONE' | 'EVENT_PEERS';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_status: ['ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'DELETED'],
      consent_kind: ['TERMS', 'PRIVACY_NOTICE', 'MARKETING'],
      profile_visibility: ['EVERYONE', 'EVENT_PEERS'],
    },
  },
} as const;
