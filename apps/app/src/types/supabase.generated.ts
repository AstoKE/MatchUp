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
      analytics_events: {
        Row: {
          id: number;
          name: string;
          occurred_at: string;
          props: NonNullable<Json>;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          name: string;
          occurred_at?: string;
          props?: NonNullable<Json>;
          user_id: string;
        };
        Update: {
          id?: never;
          name?: string;
          occurred_at?: string;
          props?: NonNullable<Json>;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'analytics_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
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
      business_members: {
        Row: {
          business_id: string;
          created_at: string;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          created_at?: string;
          role: string;
          user_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_members_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      business_venues: {
        Row: {
          business_id: string;
          created_at: string;
          venue_id: string;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          created_at?: string;
          venue_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_venues_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_venues_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: true;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      businesses: {
        Row: {
          city_id: string;
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          message: string | null;
          name: string;
          reject_reason: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          city_id: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          message?: string | null;
          name: string;
          reject_reason?: string | null;
          status?: string;
        };
        Update: {
          city_id?: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          message?: string | null;
          name?: string;
          reject_reason?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'businesses_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'businesses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'businesses_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cities: {
        Row: {
          centroid: unknown;
          country_code: string;
          id: string;
          is_active: boolean;
          names: NonNullable<Json>;
          slug: string;
          timezone: string;
          wikidata_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          centroid?: unknown;
          country_code: string;
          id?: string;
          is_active?: boolean;
          names: NonNullable<Json>;
          slug: string;
          timezone: string;
          wikidata_id?: string | null;
        };
        Update: {
          centroid?: unknown;
          country_code?: string;
          id?: string;
          is_active?: boolean;
          names?: NonNullable<Json>;
          slug?: string;
          timezone?: string;
          wikidata_id?: string | null;
        };
        Relationships: [];
      };
      districts: {
        Row: {
          centroid: unknown;
          city_id: string;
          id: string;
          is_active: boolean;
          names: NonNullable<Json>;
          slug: string;
          wikidata_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          centroid?: unknown;
          city_id: string;
          id?: string;
          is_active?: boolean;
          names: NonNullable<Json>;
          slug: string;
          wikidata_id?: string | null;
        };
        Update: {
          centroid?: unknown;
          city_id?: string;
          id?: string;
          is_active?: boolean;
          names?: NonNullable<Json>;
          slug?: string;
          wikidata_id?: string | null;
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
          exact_point: unknown;
          location_label: string;
          participant_notes: string | null;
          updated_at: string;
          venue_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          address_text?: string | null;
          event_id: string;
          exact_point?: unknown;
          location_label: string;
          participant_notes?: string | null;
          updated_at?: string;
          venue_id?: string | null;
        };
        Update: {
          address_text?: string | null;
          event_id?: string;
          exact_point?: unknown;
          location_label?: string;
          participant_notes?: string | null;
          updated_at?: string;
          venue_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_private_details_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_private_details_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
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
          organization_id: string | null;
          organizer_id: string;
          organizer_plays: boolean;
          public_location_label: string | null;
          public_point: unknown;
          public_point_precision: string;
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
          organization_id?: string | null;
          organizer_id: string;
          organizer_plays?: boolean;
          public_location_label?: string | null;
          public_point?: unknown;
          public_point_precision?: string;
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
          organization_id?: string | null;
          organizer_id?: string;
          organizer_plays?: boolean;
          public_location_label?: string | null;
          public_point?: unknown;
          public_point_precision?: string;
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
            foreignKeyName: 'events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
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
      feedback: {
        Row: {
          body: string;
          context: string | null;
          created_at: string;
          handled_at: string | null;
          handled_by: string | null;
          id: string;
          kind: string;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          context?: string | null;
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          kind: string;
          status?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          context?: string | null;
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          kind?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'feedback_handled_by_fkey';
            columns: ['handled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'feedback_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      moderation_actions: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          id: number;
          note: string | null;
          outcome: string | null;
          report_id: string | null;
          target_id: string;
          target_type: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          id?: never;
          note?: string | null;
          outcome?: string | null;
          report_id?: string | null;
          target_id: string;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          id?: never;
          note?: string | null;
          outcome?: string | null;
          report_id?: string | null;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [];
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
      organization_members: {
        Row: {
          created_at: string;
          invited_by: string | null;
          organization_id: string;
          role: string;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          invited_by?: string | null;
          organization_id: string;
          role: string;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          invited_by?: string | null;
          organization_id?: string;
          role?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_members_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          city_id: string;
          created_at: string;
          created_by: string;
          decided_at: string | null;
          decided_by: string | null;
          description: string | null;
          id: string;
          name: string;
          reject_reason: string | null;
          sport_ids: string[];
          status: string;
        };
        ComputedFields: never;
        Insert: {
          city_id: string;
          created_at?: string;
          created_by: string;
          decided_at?: string | null;
          decided_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          reject_reason?: string | null;
          sport_ids: string[];
          status?: string;
        };
        Update: {
          city_id?: string;
          created_at?: string;
          created_by?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          reject_reason?: string | null;
          sport_ids?: string[];
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organizations_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organizations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organizations_decided_by_fkey';
            columns: ['decided_by'];
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
          avatar_key: string | null;
          avatar_path: string | null;
          bio: string | null;
          city_id: string | null;
          created_at: string;
          deletion_requested_at: string | null;
          display_name: string | null;
          district_id: string | null;
          gender: Database['public']['Enums']['profile_gender'] | null;
          id: string;
          onboarded_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_status?: Database['public']['Enums']['account_status'];
          adult_confirmed_at?: string | null;
          avatar_key?: string | null;
          avatar_path?: string | null;
          bio?: string | null;
          city_id?: string | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          district_id?: string | null;
          gender?: Database['public']['Enums']['profile_gender'] | null;
          id: string;
          onboarded_at?: string | null;
          updated_at?: string;
        };
        Update: {
          account_status?: Database['public']['Enums']['account_status'];
          adult_confirmed_at?: string | null;
          avatar_key?: string | null;
          avatar_path?: string | null;
          bio?: string | null;
          city_id?: string | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          district_id?: string | null;
          gender?: Database['public']['Enums']['profile_gender'] | null;
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
      push_deliveries: {
        Row: {
          created_at: string;
          device_id: number | null;
          error: string | null;
          id: number;
          outbox_id: number;
          position: number;
          request_id: number;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          device_id?: number | null;
          error?: string | null;
          id?: never;
          outbox_id: number;
          position: number;
          request_id: number;
          status?: string;
        };
        Update: {
          created_at?: string;
          device_id?: number | null;
          error?: string | null;
          id?: never;
          outbox_id?: number;
          position?: number;
          request_id?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_deliveries_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'push_devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_deliveries_outbox_id_fkey';
            columns: ['outbox_id'];
            isOneToOne: false;
            referencedRelation: 'push_outbox';
            referencedColumns: ['id'];
          },
        ];
      };
      push_devices: {
        Row: {
          created_at: string;
          id: number;
          last_seen_at: string;
          platform: string;
          token: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          last_seen_at?: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          last_seen_at?: string;
          platform?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      push_outbox: {
        Row: {
          args: NonNullable<Json>;
          created_at: string;
          dispatched_at: string | null;
          event_id: string | null;
          id: number;
          kind: string;
          send_after: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          args?: NonNullable<Json>;
          created_at?: string;
          dispatched_at?: string | null;
          event_id?: string | null;
          id?: never;
          kind: string;
          send_after?: string | null;
          user_id: string;
        };
        Update: {
          args?: NonNullable<Json>;
          created_at?: string;
          dispatched_at?: string | null;
          event_id?: string | null;
          id?: never;
          kind?: string;
          send_after?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_outbox_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
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
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          handled_at: string | null;
          handled_by: string | null;
          id: string;
          reason: string;
          reporter_id: string;
          status: string;
          target_id: string;
          target_type: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          details?: string | null;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          reason: string;
          reporter_id: string;
          status?: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          reason?: string;
          reporter_id?: string;
          status?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_handled_by_fkey';
            columns: ['handled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
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
      user_blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_blocks_blocker_id_fkey';
            columns: ['blocker_id'];
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
          analytics_consent_at: string | null;
          created_at: string;
          locale: string;
          marketing_consent_at: string | null;
          profile_visibility: Database['public']['Enums']['profile_visibility'];
          push_activity: boolean;
          push_prompted_at: string | null;
          push_recommendations_at: string | null;
          push_reminders_at: string | null;
          show_badges: boolean;
          show_reliability: boolean;
          theme: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          analytics_consent_at?: string | null;
          created_at?: string;
          locale?: string;
          marketing_consent_at?: string | null;
          profile_visibility?: Database['public']['Enums']['profile_visibility'];
          push_activity?: boolean;
          push_prompted_at?: string | null;
          push_recommendations_at?: string | null;
          push_reminders_at?: string | null;
          show_badges?: boolean;
          show_reliability?: boolean;
          theme?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          analytics_consent_at?: string | null;
          created_at?: string;
          locale?: string;
          marketing_consent_at?: string | null;
          profile_visibility?: Database['public']['Enums']['profile_visibility'];
          push_activity?: boolean;
          push_prompted_at?: string | null;
          push_recommendations_at?: string | null;
          push_reminders_at?: string | null;
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
      venue_sports: {
        Row: {
          sport_id: string;
          venue_id: string;
        };
        ComputedFields: never;
        Insert: {
          sport_id: string;
          venue_id: string;
        };
        Update: {
          sport_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_sports_sport_id_fkey';
            columns: ['sport_id'];
            isOneToOne: false;
            referencedRelation: 'sports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venue_sports_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      venues: {
        Row: {
          address_text: string | null;
          city_id: string;
          created_at: string;
          district_id: string;
          id: string;
          kind: string;
          listing_status: string;
          location: unknown;
          name: string;
          name_search: string;
          provenance: string;
          source_ref: string | null;
          submitted_by: string | null;
          verification_status: string;
          verified_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          address_text?: string | null;
          city_id: string;
          created_at?: string;
          district_id: string;
          id?: string;
          kind: string;
          listing_status?: string;
          location: unknown;
          name: string;
          name_search?: never;
          provenance: string;
          source_ref?: string | null;
          submitted_by?: string | null;
          verification_status?: string;
          verified_at?: string | null;
        };
        Update: {
          address_text?: string | null;
          city_id?: string;
          created_at?: string;
          district_id?: string;
          id?: string;
          kind?: string;
          listing_status?: string;
          location?: unknown;
          name?: string;
          name_search?: never;
          provenance?: string;
          source_ref?: string | null;
          submitted_by?: string | null;
          verification_status?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'venues_district_in_city';
            columns: ['district_id', 'city_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id', 'city_id'];
          },
          {
            foreignKeyName: 'venues_submitted_by_fkey';
            columns: ['submitted_by'];
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
      admin_add_venue: { Args: { p_input: Json; p_source_ref?: string }; Returns: string };
      admin_cancel_event: { Args: { p_event_id: string; p_note: string }; Returns: undefined };
      admin_create_business: {
        Args: { p_city_id: string; p_name: string; p_owner: string; p_venue_ids: string[] };
        Returns: string;
      };
      admin_decide_business: {
        Args: { p_approve: boolean; p_id: string; p_reason?: string };
        Returns: undefined;
      };
      admin_decide_organization: {
        Args: { p_approve: boolean; p_id: string; p_reason?: string };
        Returns: undefined;
      };
      admin_get_organization: { Args: { p_id: string }; Returns: Json };
      admin_get_report: { Args: { p_report_id: string }; Returns: Json };
      admin_get_user: { Args: { p_user_id: string }; Returns: Json };
      admin_hide_review: { Args: { p_note: string; p_review_id: string }; Returns: undefined };
      admin_list_actions: { Args: { p_cursor?: Json; p_limit?: number }; Returns: Json };
      admin_list_business_requests: { Args: { p_status?: string }; Returns: Json };
      admin_list_disputes: { Args: Record<PropertyKey, never>; Returns: Json };
      admin_list_feedback: { Args: { p_status?: string }; Returns: Json };
      admin_list_flags: { Args: Record<PropertyKey, never>; Returns: Json };
      admin_list_organization_requests: { Args: { p_status?: string }; Returns: Json };
      admin_list_reports: {
        Args: { p_cursor?: Json; p_limit?: number; p_status?: string };
        Returns: Json;
      };
      admin_list_reviews: { Args: { p_reviewee?: string; p_reviewer?: string }; Returns: Json };
      admin_list_venues: {
        Args: { p_cursor?: Json; p_limit?: number; p_status?: string };
        Returns: Json;
      };
      admin_pilot_metrics: { Args: { p_days?: number }; Returns: Json };
      admin_reinstate_user: { Args: { p_note: string; p_user_id: string }; Returns: undefined };
      admin_remove_avatar_photo: { Args: { p_note: string; p_user_id: string }; Returns: string };
      admin_resolve_attendance_dispute: {
        Args: {
          p_participation_id: string;
          p_resolution: Database['public']['Enums']['attendance_status'];
        };
        Returns: undefined;
      };
      admin_resolve_report: {
        Args: { p_note?: string; p_outcome: string; p_report_id: string };
        Returns: number;
      };
      admin_restore_review: { Args: { p_note: string; p_review_id: string }; Returns: undefined };
      admin_search_users: { Args: { p_query: string }; Returns: Json };
      admin_set_business_hidden: {
        Args: { p_hidden: boolean; p_id: string; p_note: string };
        Returns: undefined;
      };
      admin_set_feedback_status: { Args: { p_id: string; p_status: string }; Returns: undefined };
      admin_set_organization_hidden: {
        Args: { p_hidden: boolean; p_id: string; p_note: string };
        Returns: undefined;
      };
      admin_set_venue_status: {
        Args: { p_action: string; p_note?: string; p_venue_id: string };
        Returns: boolean;
      };
      admin_suspend_user: { Args: { p_note: string; p_user_id: string }; Returns: undefined };
      approve_participation: { Args: { p_participation_id: string }; Returns: undefined };
      block_user: { Args: { p_user_id: string }; Returns: undefined };
      cancel_account_deletion: { Args: Record<PropertyKey, never>; Returns: undefined };
      cancel_business_request: { Args: { p_id: string }; Returns: undefined };
      cancel_event: {
        Args: { p_event_id: string; p_message?: string; p_reason: string };
        Returns: undefined;
      };
      cancel_organization_request: { Args: { p_id: string }; Returns: undefined };
      cancel_participation: { Args: { p_event_id: string }; Returns: undefined };
      catalog_places: { Args: Record<PropertyKey, never>; Returns: Json };
      clear_my_avatar_photo: { Args: Record<PropertyKey, never>; Returns: undefined };
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
      decide_organization_request: {
        Args: { p_accept: boolean; p_org: string; p_user: string };
        Returns: undefined;
      };
      delete_draft: { Args: { p_event_id: string }; Returns: undefined };
      dispute_attendance: {
        Args: { p_participation_id: string; p_reason: string };
        Returns: undefined;
      };
      export_my_data: { Args: Record<PropertyKey, never>; Returns: Json };
      finalize_attendance: { Args: { p_event_id: string }; Returns: undefined };
      get_event: { Args: { p_event_id: string; p_invite_token?: string }; Returns: Json };
      get_event_attendance: { Args: { p_event_id: string }; Returns: Json };
      get_event_organization: { Args: { p_event_id: string }; Returns: Json };
      get_event_reviews: { Args: { p_event_id: string }; Returns: Json };
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
          phone_required: boolean;
          phone_verified: boolean;
          user_id: string;
        }[];
      };
      get_my_avatar: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_business: { Args: { p_id: string }; Returns: Json };
      get_organization: { Args: { p_id: string }; Returns: Json };
      get_player_card: { Args: { p_user_id: string }; Returns: Json };
      get_venue_business: { Args: { p_venue_id: string }; Returns: Json };
      invite_to_organization: { Args: { p_org: string; p_user: string }; Returns: string };
      leave_organization: { Args: { p_org: string }; Returns: undefined };
      list_event_requests: { Args: { p_event_id: string }; Returns: Json };
      list_my_blocks: { Args: Record<PropertyKey, never>; Returns: Json };
      list_my_businesses: { Args: Record<PropertyKey, never>; Returns: Json };
      list_my_events: {
        Args: { p_bucket: string; p_cursor?: Json; p_limit?: number };
        Returns: Json;
      };
      list_my_organizations: { Args: Record<PropertyKey, never>; Returns: Json };
      list_organization_events: { Args: { p_org: string }; Returns: Json };
      list_organizations_to_invite: { Args: { p_user: string }; Returns: Json };
      mark_attendance: {
        Args: {
          p_participation_id: string;
          p_value: Database['public']['Enums']['attendance_status'];
        };
        Returns: undefined;
      };
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number };
      publish_event: { Args: { p_event_id: string }; Returns: undefined };
      register_push_device: { Args: { p_platform: string; p_token: string }; Returns: undefined };
      reject_participation: { Args: { p_participation_id: string }; Returns: undefined };
      remove_organization_member: { Args: { p_org: string; p_user: string }; Returns: undefined };
      remove_participant: {
        Args: { p_participation_id: string; p_reason?: string };
        Returns: undefined;
      };
      remove_sport_profile: { Args: { p_sport_id: string }; Returns: undefined };
      replace_my_sport_profiles: { Args: { p_sports: Json }; Returns: undefined };
      report: {
        Args: {
          p_details?: string;
          p_invite_token?: string;
          p_reason: string;
          p_target_id: string;
          p_target_type: string;
        };
        Returns: string;
      };
      request_account_deletion: { Args: Record<PropertyKey, never>; Returns: string };
      request_business: {
        Args: {
          p_city_id: string;
          p_contact_email: string;
          p_contact_phone: string;
          p_message: string;
          p_name: string;
          p_venue_ids: string[];
        };
        Returns: string;
      };
      request_join: {
        Args: {
          p_event_id: string;
          p_invite_token?: string;
          p_message?: string;
          p_position_id?: string;
        };
        Returns: string;
      };
      request_organization: {
        Args: { p_city_id: string; p_description: string; p_name: string; p_sport_ids: string[] };
        Returns: string;
      };
      request_to_join_organization: { Args: { p_org: string }; Returns: string };
      respond_to_organization_invite: {
        Args: { p_accept: boolean; p_org: string };
        Returns: undefined;
      };
      search_events: { Args: { p_cursor?: Json; p_filters?: Json }; Returns: Json };
      search_venues: { Args: { p_filters: Json }; Returns: Json };
      send_test_push: { Args: Record<PropertyKey, never>; Returns: boolean };
      set_analytics_consent: { Args: { p_granted: boolean }; Returns: undefined };
      set_event_organization: { Args: { p_event_id: string; p_org?: string }; Returns: undefined };
      set_marketing_consent: { Args: { p_granted: boolean }; Returns: undefined };
      set_my_avatar: { Args: { p_avatar_key: string }; Returns: undefined };
      set_my_avatar_photo: { Args: { p_path: string }; Returns: string };
      set_my_gender: {
        Args: { p_gender: Database['public']['Enums']['profile_gender'] };
        Returns: undefined;
      };
      set_organization_role: {
        Args: { p_org: string; p_role: string; p_user: string };
        Returns: undefined;
      };
      set_push_consents: {
        Args: { p_recommendations: boolean; p_reminders: boolean };
        Returns: undefined;
      };
      set_push_preferences: {
        Args: { p_activity: boolean; p_recommendations: boolean; p_reminders: boolean };
        Returns: undefined;
      };
      set_sport_profile: {
        Args: { p_level: number; p_position_ids: string[]; p_sport_id: string };
        Returns: undefined;
      };
      submit_feedback: {
        Args: { p_body: string; p_context?: string; p_kind: string };
        Returns: string;
      };
      submit_reviews: { Args: { p_event_id: string; p_reviews: Json }; Returns: number };
      suggest_venue: { Args: { p_input: Json }; Returns: string };
      track_event: { Args: { p_name: string; p_props?: Json }; Returns: boolean };
      transfer_organization_ownership: {
        Args: { p_org: string; p_user: string };
        Returns: undefined;
      };
      unblock_user: { Args: { p_user_id: string }; Returns: undefined };
      unregister_push_device: { Args: { p_token: string }; Returns: undefined };
      update_business_venue: {
        Args: {
          p_address: string;
          p_business: string;
          p_name: string;
          p_sport_ids: string[];
          p_venue: string;
        };
        Returns: undefined;
      };
      update_event: { Args: { p_event_id: string; p_input: Json }; Returns: undefined };
      update_my_business: {
        Args: { p_contact_email: string; p_contact_phone: string; p_id: string; p_name: string };
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
      waitlist_participation: { Args: { p_participation_id: string }; Returns: undefined };
    };
    Enums: {
      account_status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED';
      attendance_status: 'NOT_CONFIRMED' | 'PRESENT' | 'ABSENT' | 'DISPUTED';
      booking_status: 'NOT_REQUIRED' | 'NOT_YET_BOOKED' | 'BOOKED_EXTERNALLY' | 'TO_BE_CONFIRMED';
      consent_kind:
        | 'TERMS'
        | 'PRIVACY_NOTICE'
        | 'MARKETING'
        | 'ANALYTICS'
        | 'PUSH_RECOMMENDATIONS'
        | 'PUSH_REMINDERS';
      event_cancel_reason:
        | 'WEATHER'
        | 'VENUE_UNAVAILABLE'
        | 'NOT_ENOUGH_PLAYERS'
        | 'ORGANIZER_UNAVAILABLE'
        | 'OTHER'
        | 'MODERATION';
      event_setting: 'INDOOR' | 'OUTDOOR';
      event_status: 'DRAFT' | 'PUBLISHED' | 'CANCELED' | 'COMPLETED';
      event_type: 'COMMUNITY' | 'PARTNER';
      event_visibility: 'PUBLIC' | 'INVITE_ONLY';
      location_visibility: 'PUBLIC' | 'APPROVED_ONLY';
      participation_status:
        'REQUESTED' | 'APPROVED' | 'REJECTED' | 'WAITLISTED' | 'CANCELED' | 'REMOVED';
      profile_gender: 'FEMALE' | 'MALE' | 'UNDISCLOSED';
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
      consent_kind: [
        'TERMS',
        'PRIVACY_NOTICE',
        'MARKETING',
        'ANALYTICS',
        'PUSH_RECOMMENDATIONS',
        'PUSH_REMINDERS',
      ],
      event_cancel_reason: [
        'WEATHER',
        'VENUE_UNAVAILABLE',
        'NOT_ENOUGH_PLAYERS',
        'ORGANIZER_UNAVAILABLE',
        'OTHER',
        'MODERATION',
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
      profile_gender: ['FEMALE', 'MALE', 'UNDISCLOSED'],
      profile_visibility: ['EVERYONE', 'EVENT_PEERS'],
    },
  },
} as const;
