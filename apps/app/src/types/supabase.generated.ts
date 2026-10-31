export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      achievement_definitions: {
        Row: {
          code: string;
          descriptions: NonNullable<Json>;
          is_active: boolean;
          names: NonNullable<Json>;
          rule: NonNullable<Json>;
          scope: string;
          version: number;
          xp_bonus: number;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          descriptions: NonNullable<Json>;
          is_active?: boolean;
          names: NonNullable<Json>;
          rule: NonNullable<Json>;
          scope: string;
          version?: number;
          xp_bonus: number;
        };
        Update: {
          code?: string;
          descriptions?: NonNullable<Json>;
          is_active?: boolean;
          names?: NonNullable<Json>;
          rule?: NonNullable<Json>;
          scope?: string;
          version?: number;
          xp_bonus?: number;
        };
        Relationships: [];
      };
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
      attendance_disputes: {
        Row: {
          created_at: string;
          participation_id: string;
          reason: string | null;
          resolution: Database['public']['Enums']['attendance_status'] | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          participation_id: string;
          reason?: string | null;
          resolution?: Database['public']['Enums']['attendance_status'] | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          participation_id?: string;
          reason?: string | null;
          resolution?: Database['public']['Enums']['attendance_status'] | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_disputes_participation_id_fkey';
            columns: ['participation_id'];
            isOneToOne: true;
            referencedRelation: 'event_participations';
            referencedColumns: ['id'];
          },
        ];
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
      event_participations: {
        Row: {
          approved_at: string | null;
          attendance: Database['public']['Enums']['attendance_status'];
          attendance_marked_at: string | null;
          attendance_marked_by: string | null;
          canceled_at: string | null;
          cancellation_excused: boolean;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          event_id: string;
          id: string;
          is_organizer: boolean;
          preferred_position_id: string | null;
          request_count: number;
          request_message: string | null;
          requested_at: string;
          status: Database['public']['Enums']['participation_status'];
          status_reason: string | null;
          updated_at: string;
          user_id: string;
          waitlisted_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          attendance?: Database['public']['Enums']['attendance_status'];
          attendance_marked_at?: string | null;
          attendance_marked_by?: string | null;
          canceled_at?: string | null;
          cancellation_excused?: boolean;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          event_id: string;
          id?: string;
          is_organizer?: boolean;
          preferred_position_id?: string | null;
          request_count?: number;
          request_message?: string | null;
          requested_at?: string;
          status: Database['public']['Enums']['participation_status'];
          status_reason?: string | null;
          updated_at?: string;
          user_id: string;
          waitlisted_at?: string | null;
        };
        Update: {
          approved_at?: string | null;
          attendance?: Database['public']['Enums']['attendance_status'];
          attendance_marked_at?: string | null;
          attendance_marked_by?: string | null;
          canceled_at?: string | null;
          cancellation_excused?: boolean;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          event_id?: string;
          id?: string;
          is_organizer?: boolean;
          preferred_position_id?: string | null;
          request_count?: number;
          request_message?: string | null;
          requested_at?: string;
          status?: Database['public']['Enums']['participation_status'];
          status_reason?: string | null;
          updated_at?: string;
          user_id?: string;
          waitlisted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_participations_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_participations_preferred_position_id_fkey';
            columns: ['preferred_position_id'];
            isOneToOne: false;
            referencedRelation: 'sport_positions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_participations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      event_private_details: {
        Row: {
          address_text: string | null;
          event_id: string;
          location_label: string;
          participant_notes: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address_text?: string | null;
          event_id: string;
          location_label: string;
          participant_notes?: string | null;
          updated_at?: string;
        };
        Update: {
          address_text?: string | null;
          event_id?: string;
          location_label?: string;
          participant_notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_private_details_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          approved_count: number;
          attendance_finalized_at: string | null;
          auto_approve: boolean;
          booking_status: Database['public']['Enums']['booking_status'];
          cancel_message: string | null;
          cancel_reason: Database['public']['Enums']['event_cancel_reason'] | null;
          canceled_at: string | null;
          capacity: number;
          city_id: string;
          client_request_id: string;
          completed_at: string | null;
          cost_amount_minor: number | null;
          cost_currency: string;
          cost_note: string | null;
          created_at: string;
          description: string | null;
          district_id: string;
          duration_minutes: number;
          ends_at: string;
          equipment_note: string | null;
          event_type: Database['public']['Enums']['event_type'];
          id: string;
          invite_token: string | null;
          last_material_change_at: string | null;
          location_visibility: Database['public']['Enums']['location_visibility'];
          organizer_id: string;
          organizer_plays: boolean;
          public_location_label: string | null;
          published_at: string | null;
          registration_closes_at: string | null;
          review_window_closes_at: string | null;
          setting: Database['public']['Enums']['event_setting'] | null;
          skill_max: number | null;
          skill_min: number | null;
          sport_format_id: string;
          sport_id: string;
          starts_at: string;
          status: Database['public']['Enums']['event_status'];
          title: string;
          updated_at: string;
          visibility: Database['public']['Enums']['event_visibility'];
          waitlist_enabled: boolean;
        };
        ComputedFields: never;
        Insert: {
          approved_count?: number;
          attendance_finalized_at?: string | null;
          auto_approve?: boolean;
          booking_status?: Database['public']['Enums']['booking_status'];
          cancel_message?: string | null;
          cancel_reason?: Database['public']['Enums']['event_cancel_reason'] | null;
          canceled_at?: string | null;
          capacity: number;
          city_id: string;
          client_request_id: string;
          completed_at?: string | null;
          cost_amount_minor?: number | null;
          cost_currency?: string;
          cost_note?: string | null;
          created_at?: string;
          description?: string | null;
          district_id: string;
          duration_minutes: number;
          ends_at: string;
          equipment_note?: string | null;
          event_type?: Database['public']['Enums']['event_type'];
          id?: string;
          invite_token?: string | null;
          last_material_change_at?: string | null;
          location_visibility?: Database['public']['Enums']['location_visibility'];
          organizer_id: string;
          organizer_plays?: boolean;
          public_location_label?: string | null;
          published_at?: string | null;
          registration_closes_at?: string | null;
          review_window_closes_at?: string | null;
          setting?: Database['public']['Enums']['event_setting'] | null;
          skill_max?: number | null;
          skill_min?: number | null;
          sport_format_id: string;
          sport_id: string;
          starts_at: string;
          status?: Database['public']['Enums']['event_status'];
          title: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['event_visibility'];
          waitlist_enabled?: boolean;
        };
        Update: {
          approved_count?: number;
          attendance_finalized_at?: string | null;
          auto_approve?: boolean;
          booking_status?: Database['public']['Enums']['booking_status'];
          cancel_message?: string | null;
          cancel_reason?: Database['public']['Enums']['event_cancel_reason'] | null;
          canceled_at?: string | null;
          capacity?: number;
          city_id?: string;
          client_request_id?: string;
          completed_at?: string | null;
          cost_amount_minor?: number | null;
          cost_currency?: string;
          cost_note?: string | null;
          created_at?: string;
          description?: string | null;
          district_id?: string;
          duration_minutes?: number;
          ends_at?: string;
          equipment_note?: string | null;
          event_type?: Database['public']['Enums']['event_type'];
          id?: string;
          invite_token?: string | null;
          last_material_change_at?: string | null;
          location_visibility?: Database['public']['Enums']['location_visibility'];
          organizer_id?: string;
          organizer_plays?: boolean;
          public_location_label?: string | null;
          published_at?: string | null;
          registration_closes_at?: string | null;
          review_window_closes_at?: string | null;
          setting?: Database['public']['Enums']['event_setting'] | null;
          skill_max?: number | null;
          skill_min?: number | null;
          sport_format_id?: string;
          sport_id?: string;
          starts_at?: string;
          status?: Database['public']['Enums']['event_status'];
          title?: string;
          updated_at?: string;
          visibility?: Database['public']['Enums']['event_visibility'];
          waitlist_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'events_district_id_city_id_fkey';
            columns: ['district_id', 'city_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id', 'city_id'];
          },
          {
            foreignKeyName: 'events_organizer_id_fkey';
            columns: ['organizer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_sport_format_id_sport_id_fkey';
            columns: ['sport_format_id', 'sport_id'];
            isOneToOne: false;
            referencedRelation: 'sport_formats';
            referencedColumns: ['id', 'sport_id'];
          },
          {
            foreignKeyName: 'events_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          dedupe_key: string;
          id: string;
          payload: NonNullable<Json>;
          read_at: string | null;
          type: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          dedupe_key: string;
          id?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dedupe_key?: string;
          id?: string;
          payload?: NonNullable<Json>;
          read_at?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
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
      reliability_events: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          kind: string;
          occurred_at: string;
          participation_id: string;
          user_id: string;
          void_reason: string | null;
          voided_at: string | null;
          weight: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          kind: string;
          occurred_at: string;
          participation_id: string;
          user_id: string;
          void_reason?: string | null;
          voided_at?: string | null;
          weight: number;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          kind?: string;
          occurred_at?: string;
          participation_id?: string;
          user_id?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'reliability_events_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reliability_events_participation_id_fkey';
            columns: ['participation_id'];
            isOneToOne: false;
            referencedRelation: 'event_participations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reliability_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      skill_reviews: {
        Row: {
          created_at: string;
          event_id: string;
          fair_play: boolean;
          id: string;
          reviewee_id: string;
          reviewer_id: string;
          skill_score: number;
          sport_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          fair_play?: boolean;
          id?: string;
          reviewee_id: string;
          reviewer_id: string;
          skill_score: number;
          sport_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          fair_play?: boolean;
          id?: string;
          reviewee_id?: string;
          reviewer_id?: string;
          skill_score?: number;
          sport_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'skill_reviews_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'skill_reviews_reviewee_id_fkey';
            columns: ['reviewee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'skill_reviews_reviewer_id_fkey';
            columns: ['reviewer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'skill_reviews_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
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
      user_achievements: {
        Row: {
          awarded_at: string;
          code: string;
          id: string;
          revoked_at: string | null;
          source_event_id: string | null;
          sport_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          awarded_at?: string;
          code: string;
          id?: string;
          revoked_at?: string | null;
          source_event_id?: string | null;
          sport_id?: string | null;
          user_id: string;
        };
        Update: {
          awarded_at?: string;
          code?: string;
          id?: string;
          revoked_at?: string | null;
          source_event_id?: string | null;
          sport_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_achievements_code_fkey';
            columns: ['code'];
            isOneToOne: false;
            referencedRelation: 'achievement_definitions';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'user_achievements_source_event_id_fkey';
            columns: ['source_event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_achievements_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_achievements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
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
      user_progress: {
        Row: {
          algorithm_version: number;
          computed_at: string;
          reliability_confidence: number;
          reliability_samples: number;
          reliability_score: number;
          user_id: string;
          xp_total: number;
        };
        ComputedFields: never;
        Insert: {
          algorithm_version?: number;
          computed_at?: string;
          reliability_confidence: number;
          reliability_samples: number;
          reliability_score: number;
          user_id: string;
          xp_total?: number;
        };
        Update: {
          algorithm_version?: number;
          computed_at?: string;
          reliability_confidence?: number;
          reliability_samples?: number;
          reliability_score?: number;
          user_id?: string;
          xp_total?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'user_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
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
      user_sport_ratings: {
        Row: {
          algorithm_version: number;
          computed_at: string;
          confidence: number;
          rating: number;
          sample_events: number;
          sport_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          algorithm_version?: number;
          computed_at?: string;
          confidence: number;
          rating: number;
          sample_events: number;
          sport_id: string;
          user_id: string;
        };
        Update: {
          algorithm_version?: number;
          computed_at?: string;
          confidence?: number;
          rating?: number;
          sample_events?: number;
          sport_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_sport_ratings_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_sport_ratings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      xp_transactions: {
        Row: {
          amount: number;
          created_at: string;
          dedupe_key: string;
          id: string;
          reason_code: string;
          rule_version: number;
          source_id: string | null;
          source_type: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          dedupe_key: string;
          id?: string;
          reason_code: string;
          rule_version?: number;
          source_id?: string | null;
          source_type: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          dedupe_key?: string;
          id?: string;
          reason_code?: string;
          rule_version?: number;
          source_id?: string | null;
          source_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'xp_transactions_user_id_fkey';
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
      admin_resolve_attendance_dispute: {
        Args: {
          p_participation_id: string;
          p_resolution: Database['public']['Enums']['attendance_status'];
        };
        Returns: undefined;
      };
      approve_participation: { Args: { p_participation_id: string }; Returns: undefined };
      cancel_account_deletion: { Args: Record<PropertyKey, never>; Returns: undefined };
      cancel_event: {
        Args: { p_event_id: string; p_message?: string; p_reason: string };
        Returns: undefined;
      };
      cancel_participation: { Args: { p_event_id: string }; Returns: undefined };
      complete_event: { Args: { p_event_id: string }; Returns: undefined };
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
      create_event: {
        Args: { p_client_request_id: string; p_input: Json; p_publish?: boolean };
        Returns: string;
      };
      delete_draft: { Args: { p_event_id: string }; Returns: undefined };
      dispute_attendance: {
        Args: { p_participation_id: string; p_reason: string };
        Returns: undefined;
      };
      export_my_data: { Args: Record<PropertyKey, never>; Returns: Json };
      finalize_attendance: { Args: { p_event_id: string }; Returns: undefined };
      get_event: { Args: { p_event_id: string; p_invite_token?: string }; Returns: Json };
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
      list_event_requests: { Args: { p_event_id: string }; Returns: Json };
      list_my_events: {
        Args: { p_bucket: string; p_cursor?: Json; p_limit?: number };
        Returns: Json;
      };
      mark_attendance: {
        Args: {
          p_participation_id: string;
          p_value: Database['public']['Enums']['attendance_status'];
        };
        Returns: undefined;
      };
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number };
      publish_event: { Args: { p_event_id: string }; Returns: undefined };
      reject_participation: { Args: { p_participation_id: string }; Returns: undefined };
      remove_participant: {
        Args: { p_participation_id: string; p_reason?: string };
        Returns: undefined;
      };
      remove_sport_profile: { Args: { p_sport_id: string }; Returns: undefined };
      replace_my_sport_profiles: { Args: { p_sports: Json }; Returns: undefined };
      request_account_deletion: { Args: Record<PropertyKey, never>; Returns: string };
      request_join: {
        Args: {
          p_event_id: string;
          p_invite_token?: string;
          p_message?: string;
          p_position_id?: string;
        };
        Returns: string;
      };
      search_events: { Args: { p_cursor?: Json; p_filters?: Json }; Returns: Json };
      set_marketing_consent: { Args: { p_granted: boolean }; Returns: undefined };
      set_sport_profile: {
        Args: { p_level: number; p_position_ids: string[]; p_sport_id: string };
        Returns: undefined;
      };
      submit_reviews: { Args: { p_event_id: string; p_reviews: Json }; Returns: number };
      update_event: { Args: { p_event_id: string; p_input: Json }; Returns: undefined };
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
      waitlist_participation: { Args: { p_participation_id: string }; Returns: undefined };
    };
    Enums: {
      account_status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED';
      attendance_status: 'NOT_CONFIRMED' | 'PRESENT' | 'ABSENT' | 'DISPUTED';
      booking_status: 'NOT_REQUIRED' | 'NOT_YET_BOOKED' | 'BOOKED_EXTERNALLY' | 'TO_BE_CONFIRMED';
      consent_kind: 'TERMS' | 'PRIVACY_NOTICE' | 'MARKETING';
      event_cancel_reason:
        'WEATHER' | 'VENUE_UNAVAILABLE' | 'NOT_ENOUGH_PLAYERS' | 'ORGANIZER_UNAVAILABLE' | 'OTHER';
      event_setting: 'INDOOR' | 'OUTDOOR';
      event_status: 'DRAFT' | 'PUBLISHED' | 'CANCELED' | 'COMPLETED';
      event_type: 'COMMUNITY' | 'PARTNER';
      event_visibility: 'PUBLIC' | 'INVITE_ONLY';
      location_visibility: 'PUBLIC' | 'APPROVED_ONLY';
      participation_status:
        'REQUESTED' | 'APPROVED' | 'REJECTED' | 'WAITLISTED' | 'CANCELED' | 'REMOVED';
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
      attendance_status: ['NOT_CONFIRMED', 'PRESENT', 'ABSENT', 'DISPUTED'],
      booking_status: ['NOT_REQUIRED', 'NOT_YET_BOOKED', 'BOOKED_EXTERNALLY', 'TO_BE_CONFIRMED'],
      consent_kind: ['TERMS', 'PRIVACY_NOTICE', 'MARKETING'],
      event_cancel_reason: [
        'WEATHER',
        'VENUE_UNAVAILABLE',
        'NOT_ENOUGH_PLAYERS',
        'ORGANIZER_UNAVAILABLE',
        'OTHER',
      ],
      event_setting: ['INDOOR', 'OUTDOOR'],
      event_status: ['DRAFT', 'PUBLISHED', 'CANCELED', 'COMPLETED'],
      event_type: ['COMMUNITY', 'PARTNER'],
      event_visibility: ['PUBLIC', 'INVITE_ONLY'],
      location_visibility: ['PUBLIC', 'APPROVED_ONLY'],
      participation_status: [
        'REQUESTED',
        'APPROVED',
        'REJECTED',
        'WAITLISTED',
        'CANCELED',
        'REMOVED',
      ],
      profile_visibility: ['EVERYONE', 'EVENT_PEERS'],
    },
  },
} as const;
