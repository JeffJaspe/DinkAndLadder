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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      achievement_definitions: {
        Row: {
          category: string
          created_at: string
          criteria: Json
          description: string
          icon: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          points: number
          tier: string
        }
        Insert: {
          category: string
          created_at?: string
          criteria: Json
          description: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          points?: number
          tier: string
        }
        Update: {
          category?: string
          created_at?: string
          criteria?: Json
          description?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          points?: number
          tier?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          activity_type: string
          actor_club_id: string | null
          actor_player_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          visibility: string
        }
        Insert: {
          activity_type: string
          actor_club_id?: string | null
          actor_player_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          visibility?: string
        }
        Update: {
          activity_type?: string
          actor_club_id?: string | null
          actor_player_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_activity_actor_club"
            columns: ["actor_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_actor_player"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: string[] | null
          player_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          permissions?: string[] | null
          player_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: string[] | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_api_keys_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          actor_player_id: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          payload: Json | null
          target_id: string
          target_type: string
          user_agent: string | null
        }
        Insert: {
          actor_player_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          target_id: string
          target_type: string
          user_agent?: string | null
        }
        Update: {
          actor_player_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          target_id?: string
          target_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      bracket_matches: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          match_id: string | null
          participant1_registration_id: string | null
          participant2_registration_id: string | null
          position: number
          round: number
          scheduled_at: string | null
          status: string
          tournament_id: string
          winner_registration_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          participant1_registration_id?: string | null
          participant2_registration_id?: string | null
          position: number
          round: number
          scheduled_at?: string | null
          status?: string
          tournament_id: string
          winner_registration_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          participant1_registration_id?: string | null
          participant2_registration_id?: string | null
          position?: number
          round?: number
          scheduled_at?: string | null
          status?: string
          tournament_id?: string
          winner_registration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_bracket_matches_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bracket_matches_match"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bracket_matches_participant1"
            columns: ["participant1_registration_id"]
            isOneToOne: false
            referencedRelation: "tournament_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bracket_matches_participant2"
            columns: ["participant2_registration_id"]
            isOneToOne: false
            referencedRelation: "tournament_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bracket_matches_tournament"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bracket_matches_winner"
            columns: ["winner_registration_id"]
            isOneToOne: false
            referencedRelation: "tournament_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      club_announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          player_id: string
          read_at: string
        }
        Insert: {
          announcement_id: string
          id?: string
          player_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: string
          id?: string
          player_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_announcement_read_announcement"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "club_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_announcement_read_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_announcements: {
        Row: {
          announcement_type: string
          archived_at: string | null
          author_player_id: string
          body: string
          club_id: string
          created_at: string
          event_id: string | null
          id: string
          pinned: boolean
          published_at: string | null
          status: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          announcement_type?: string
          archived_at?: string | null
          author_player_id: string
          body: string
          club_id: string
          created_at?: string
          event_id?: string | null
          id?: string
          pinned?: boolean
          published_at?: string | null
          status?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          announcement_type?: string
          archived_at?: string | null
          author_player_id?: string
          body?: string
          club_id?: string
          created_at?: string
          event_id?: string | null
          id?: string
          pinned?: boolean
          published_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_announcement_author"
            columns: ["author_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_announcement_club"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_announcement_event"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      club_memberships: {
        Row: {
          club_id: string
          created_at: string
          id: string
          joined_at: string | null
          left_at: string | null
          player_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          player_id: string
          role: string
          status: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          joined_at?: string | null
          left_at?: string | null
          player_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_club_memberships_club"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_club_memberships_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          club_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          club_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          club_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_club_subscriptions_club"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_club_subscriptions_plan"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          barangay: string | null
          city: string | null
          court_address: string | null
          court_name: string | null
          created_at: string
          created_by_user_id: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          province: string | null
          slug: string
          status: string
          updated_at: string
          verification_requested_at: string | null
          verification_status: string
          verified_at: string | null
          verified_by_user_id: string | null
          visibility: string
        }
        Insert: {
          barangay?: string | null
          city?: string | null
          court_address?: string | null
          court_name?: string | null
          created_at?: string
          created_by_user_id: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          province?: string | null
          slug: string
          status?: string
          updated_at?: string
          verification_requested_at?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
          visibility?: string
        }
        Update: {
          barangay?: string | null
          city?: string | null
          court_address?: string | null
          court_name?: string | null
          created_at?: string
          created_by_user_id?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          province?: string | null
          slug?: string
          status?: string
          updated_at?: string
          verification_requested_at?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_clubs_created_by"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clubs_verified_by"
            columns: ["verified_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      databasechangelog: {
        Row: {
          author: string
          comments: string | null
          contexts: string | null
          dateexecuted: string
          deployment_id: string | null
          description: string | null
          exectype: string
          filename: string
          id: string
          labels: string | null
          liquibase: string | null
          md5sum: string | null
          orderexecuted: number
          tag: string | null
        }
        Insert: {
          author: string
          comments?: string | null
          contexts?: string | null
          dateexecuted: string
          deployment_id?: string | null
          description?: string | null
          exectype: string
          filename: string
          id: string
          labels?: string | null
          liquibase?: string | null
          md5sum?: string | null
          orderexecuted: number
          tag?: string | null
        }
        Update: {
          author?: string
          comments?: string | null
          contexts?: string | null
          dateexecuted?: string
          deployment_id?: string | null
          description?: string | null
          exectype?: string
          filename?: string
          id?: string
          labels?: string | null
          liquibase?: string | null
          md5sum?: string | null
          orderexecuted?: number
          tag?: string | null
        }
        Relationships: []
      }
      databasechangeloglock: {
        Row: {
          id: number
          locked: boolean
          lockedby: string | null
          lockgranted: string | null
        }
        Insert: {
          id: number
          locked: boolean
          lockedby?: string | null
          lockgranted?: string | null
        }
        Update: {
          id?: number
          locked?: boolean
          lockedby?: string | null
          lockgranted?: string | null
        }
        Relationships: []
      }
      event_courts: {
        Row: {
          court_name: string | null
          court_number: number
          current_match_id: string | null
          event_id: string
          id: string
          match_started_at: string | null
          status: string
        }
        Insert: {
          court_name?: string | null
          court_number: number
          current_match_id?: string | null
          event_id: string
          id?: string
          match_started_at?: string | null
          status?: string
        }
        Update: {
          court_name?: string | null
          court_number?: number
          current_match_id?: string | null
          event_id?: string
          id?: string
          match_started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_event_courts_event"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_courts_match"
            columns: ["current_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      event_queue: {
        Row: {
          court_number: number | null
          event_id: string
          id: string
          joined_at: string
          match_id: string | null
          match_type: string
          matched_at: string | null
          opponent_queue_id: string | null
          partner_id: string | null
          player_id: string
          status: string
        }
        Insert: {
          court_number?: number | null
          event_id: string
          id?: string
          joined_at?: string
          match_id?: string | null
          match_type: string
          matched_at?: string | null
          opponent_queue_id?: string | null
          partner_id?: string | null
          player_id: string
          status?: string
        }
        Update: {
          court_number?: number | null
          event_id?: string
          id?: string
          joined_at?: string
          match_id?: string | null
          match_type?: string
          matched_at?: string | null
          opponent_queue_id?: string | null
          partner_id?: string | null
          player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_event_queue_event"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_queue_match"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_queue_opponent"
            columns: ["opponent_queue_id"]
            isOneToOne: false
            referencedRelation: "event_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_queue_partner"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_queue_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          checked_in_at: string | null
          event_id: string
          id: string
          player_id: string
          registered_at: string
          status: string
          withdrawn_at: string | null
        }
        Insert: {
          checked_in_at?: string | null
          event_id: string
          id?: string
          player_id: string
          registered_at?: string
          status?: string
          withdrawn_at?: string | null
        }
        Update: {
          checked_in_at?: string | null
          event_id?: string
          id?: string
          player_id?: string
          registered_at?: string
          status?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_event_registrations_event"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_registrations_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          city: string | null
          club_id: string
          created_at: string
          created_by_player_id: string
          description: string | null
          end_date: string
          event_type: string
          fee_amount: number | null
          fee_currency: string | null
          id: string
          max_participants: number | null
          name: string
          province: string | null
          queue_courts: number
          queue_enabled: boolean
          queue_mode: string
          queue_skip_timeout_seconds: number
          registration_closes: string | null
          registration_opens: string | null
          start_date: string
          status: string
          updated_at: string
          venue: string | null
          visibility: string
        }
        Insert: {
          city?: string | null
          club_id: string
          created_at?: string
          created_by_player_id: string
          description?: string | null
          end_date: string
          event_type?: string
          fee_amount?: number | null
          fee_currency?: string | null
          id?: string
          max_participants?: number | null
          name: string
          province?: string | null
          queue_courts?: number
          queue_enabled?: boolean
          queue_mode?: string
          queue_skip_timeout_seconds?: number
          registration_closes?: string | null
          registration_opens?: string | null
          start_date: string
          status?: string
          updated_at?: string
          venue?: string | null
          visibility?: string
        }
        Update: {
          city?: string | null
          club_id?: string
          created_at?: string
          created_by_player_id?: string
          description?: string | null
          end_date?: string
          event_type?: string
          fee_amount?: number | null
          fee_currency?: string | null
          id?: string
          max_participants?: number | null
          name?: string
          province?: string | null
          queue_courts?: number
          queue_enabled?: boolean
          queue_mode?: string
          queue_skip_timeout_seconds?: number
          registration_closes?: string | null
          registration_opens?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          venue?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_events_club"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_events_creator"
            columns: ["created_by_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_participants: {
        Row: {
          created_at: string
          id: string
          match_id: string
          player_id: string
          result_status: string
          team_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          player_id: string
          result_status?: string
          team_number: number
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          player_id?: string
          result_status?: string
          team_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_match_participants_match"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_match_participants_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_score_proposals: {
        Row: {
          created_at: string
          id: string
          match_id: string
          proposal_round: number
          proposed_by_player_id: string
          scores: Json
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          proposal_round?: number
          proposed_by_player_id: string
          scores: Json
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          proposal_round?: number
          proposed_by_player_id?: string
          scores?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_match_score_proposals_match"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_match_score_proposals_player"
            columns: ["proposed_by_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_scores: {
        Row: {
          created_at: string
          id: string
          match_id: string
          set_number: number
          team1_score: number
          team2_score: number
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          set_number: number
          team1_score: number
          team2_score: number
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          set_number?: number
          team1_score?: number
          team2_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_match_scores_match"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_verifications: {
        Row: {
          created_at: string
          id: string
          match_id: string
          responded_at: string | null
          response_note: string | null
          status: string
          updated_at: string
          verifier_player_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          responded_at?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
          verifier_player_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          responded_at?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
          verifier_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_match_verifications_match"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_match_verifications_verifier"
            columns: ["verifier_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          affects_rating: boolean
          created_at: string
          event_id: string | null
          id: string
          match_type: string
          played_at: string
          status: string
          submitted_at: string
          submitted_by_player_id: string
          updated_at: string
          venue: string | null
          verified_at: string | null
        }
        Insert: {
          affects_rating?: boolean
          created_at?: string
          event_id?: string | null
          id?: string
          match_type: string
          played_at: string
          status?: string
          submitted_at?: string
          submitted_by_player_id: string
          updated_at?: string
          venue?: string | null
          verified_at?: string | null
        }
        Update: {
          affects_rating?: boolean
          created_at?: string
          event_id?: string | null
          id?: string
          match_type?: string
          played_at?: string
          status?: string
          submitted_at?: string
          submitted_by_player_id?: string
          updated_at?: string
          venue?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_matches_event"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_matches_submitted_by"
            columns: ["submitted_by_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          notification_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          notification_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          notification_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notification_deliveries_notification"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_digest: string
          id: string
          preferences: Json | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_digest?: string
          id?: string
          preferences?: Json | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_digest?: string
          id?: string
          preferences?: Json | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notification_preferences_user"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notifications_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_accounts: {
        Row: {
          created_at: string
          id: string
          provider: string
          provider_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          provider_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          provider_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_oauth_accounts_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_requests: {
        Row: {
          created_at: string
          from_player_id: string
          id: string
          message: string | null
          responded_at: string | null
          status: string
          to_player_id: string
        }
        Insert: {
          created_at?: string
          from_player_id: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: string
          to_player_id: string
        }
        Update: {
          created_at?: string
          from_player_id?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: string
          to_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_partner_requests_from"
            columns: ["from_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_partner_requests_to"
            columns: ["to_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partnerships: {
        Row: {
          created_at: string
          id: string
          player1_id: string
          player2_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player1_id: string
          player2_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player1_id?: string
          player2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_partnerships_player1"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_partnerships_player2"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount_cents: number
          club_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          player_id: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          club_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          player_id?: string | null
          status: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          club_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          player_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_payment_transactions_club"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payment_transactions_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          created_at: string
          id: string
          super_admin_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          super_admin_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          super_admin_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_platform_config_super_admin"
            columns: ["super_admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      player_achievements: {
        Row: {
          achievement_id: string
          claimed_at: string | null
          created_at: string
          id: string
          player_id: string
          progress: Json | null
          unlocked_at: string
        }
        Insert: {
          achievement_id: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          player_id: string
          progress?: Json | null
          unlocked_at?: string
        }
        Update: {
          achievement_id?: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          player_id?: string
          progress?: Json | null
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_player_achievement_definition"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_player_achievement_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_badge_showcase: {
        Row: {
          player_id: string
          selected_badge_id: string | null
          updated_at: string
        }
        Insert: {
          player_id: string
          selected_badge_id?: string | null
          updated_at?: string
        }
        Update: {
          player_id?: string
          selected_badge_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_badge_showcase_player"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profiles: {
        Row: {
          barangay: string | null
          bio: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          dominant_hand: string | null
          first_name: string | null
          id: string
          last_name: string | null
          preferred_position: string | null
          profile_visibility: string
          province: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          barangay?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          dominant_hand?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          preferred_position?: string | null
          profile_visibility?: string
          province?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          barangay?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          dominant_hand?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          preferred_position?: string | null
          profile_visibility?: string
          province?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_player_profiles_user"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      player_ratings: {
        Row: {
          calculated_at: string | null
          confidence_score: number
          created_at: string
          id: string
          matches_played: number
          player_id: string
          provisional: boolean | null
          rating_type: string
          rating_value: number | null
          updated_at: string
        }
        Insert: {
          calculated_at?: string | null
          confidence_score?: number
          created_at?: string
          id?: string
          matches_played?: number
          player_id: string
          provisional?: boolean | null
          rating_type: string
          rating_value?: number | null
          updated_at?: string
        }
        Update: {
          calculated_at?: string | null
          confidence_score?: number
          created_at?: string
          id?: string
          matches_played?: number
          player_id?: string
          provisional?: boolean | null
          rating_type?: string
          rating_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_player_ratings_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_relationships: {
        Row: {
          created_at: string
          from_player_id: string
          id: string
          relationship_type: string
          status: string
          to_player_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_player_id: string
          id?: string
          relationship_type: string
          status?: string
          to_player_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_player_id?: string
          id?: string
          relationship_type?: string
          status?: string
          to_player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_relationship_from_player"
            columns: ["from_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_relationship_to_player"
            columns: ["to_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_shoutouts: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          message: string
          player_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          player_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_shoutout_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          player_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          player_id: string
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          player_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_player_subscriptions_plan"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_player_subscriptions_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provinces: {
        Row: {
          created_at: string
          id: string
          name: string
          region_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          region_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          region_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_provinces_region"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_transactions: {
        Row: {
          calculation_version: number
          confidence_after: number
          confidence_before: number | null
          created_at: string
          id: string
          match_id: string | null
          new_rating: number
          old_rating: number | null
          player_id: string
          rating_delta: number
          rating_type: string
        }
        Insert: {
          calculation_version: number
          confidence_after: number
          confidence_before?: number | null
          created_at?: string
          id?: string
          match_id?: string | null
          new_rating: number
          old_rating?: number | null
          player_id: string
          rating_delta: number
          rating_type: string
        }
        Update: {
          calculation_version?: number
          confidence_after?: number
          confidence_before?: number | null
          created_at?: string
          id?: string
          match_id?: string | null
          new_rating?: number
          old_rating?: number | null
          player_id?: string
          rating_delta?: number
          rating_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_rating_transactions_match"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_rating_transactions_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      sponsorships: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          is_anonymous: boolean | null
          message: string | null
          sponsor_player_id: string
          status: string
          stripe_payment_intent_id: string | null
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          is_anonymous?: boolean | null
          message?: string | null
          sponsor_player_id: string
          status: string
          stripe_payment_intent_id?: string | null
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          is_anonymous?: boolean | null
          message?: string | null
          sponsor_player_id?: string
          status?: string
          stripe_payment_intent_id?: string | null
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sponsorships_sponsor"
            columns: ["sponsor_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          billing_interval: string
          created_at: string
          currency: string
          description: string | null
          features: Json | null
          id: string
          is_active: boolean
          name: string
          plan_type: string
          price_cents: number
          sort_order: number | null
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          billing_interval: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          name: string
          plan_type?: string
          price_cents: number
          sort_order?: number | null
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          plan_type?: string
          price_cents?: number
          sort_order?: number | null
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tournament_categories: {
        Row: {
          category_type: string
          created_at: string
          display_order: number
          id: string
          max_participants: number | null
          max_rating: number | null
          min_rating: number | null
          name: string
          status: string
          template_id: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          category_type?: string
          created_at?: string
          display_order?: number
          id?: string
          max_participants?: number | null
          max_rating?: number | null
          min_rating?: number | null
          name: string
          status?: string
          template_id?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          category_type?: string
          created_at?: string
          display_order?: number
          id?: string
          max_participants?: number | null
          max_rating?: number | null
          min_rating?: number | null
          name?: string
          status?: string
          template_id?: string | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tournament_categories_template"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tournament_category_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tournament_categories_tournament"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_category_templates: {
        Row: {
          created_at: string
          display_order: number
          id: string
          max_rating: number | null
          min_rating: number | null
          name: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          max_rating?: number | null
          min_rating?: number | null
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          max_rating?: number | null
          min_rating?: number | null
          name?: string
        }
        Relationships: []
      }
      tournament_registrations: {
        Row: {
          category_id: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          partner_player_id: string | null
          player_id: string
          registered_at: string
          status: string
          tournament_id: string
        }
        Insert: {
          category_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          partner_player_id?: string | null
          player_id: string
          registered_at?: string
          status?: string
          tournament_id: string
        }
        Update: {
          category_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          partner_player_id?: string | null
          player_id?: string
          registered_at?: string
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tournament_registrations_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tournament_registrations_partner"
            columns: ["partner_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tournament_registrations_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tournament_registrations_tournament"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          event_id: string
          format: string
          id: string
          match_type: string
          max_participants: number | null
          max_rating: number | null
          min_rating: number | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          format?: string
          id?: string
          match_type: string
          max_participants?: number | null
          max_rating?: number | null
          min_rating?: number | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          format?: string
          id?: string
          match_type?: string
          max_participants?: number | null
          max_rating?: number | null
          min_rating?: number | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tournaments_event"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          last_seen_at: string | null
          platform: string
          push_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          platform: string
          push_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          platform?: string
          push_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_devices_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          email_verified_at: string | null
          id: string
          last_login_at: string | null
          phone_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_verified_at?: string | null
          id?: string
          last_login_at?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_verified_at?: string | null
          id?: string
          last_login_at?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          status_code: number | null
          subscription_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: string
          payload: Json
          response_body?: string | null
          status_code?: number | null
          subscription_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          status_code?: number | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_webhook_deliveries_subscription"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "webhook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_subscriptions: {
        Row: {
          created_at: string
          events: string[]
          failure_count: number | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          player_id: string
          secret: string
          url: string
        }
        Insert: {
          created_at?: string
          events: string[]
          failure_count?: number | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          player_id: string
          secret: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          failure_count?: number | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          player_id?: string
          secret?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_webhook_subscriptions_player"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_can_view_event_matches: {
        Args: { target_event_id: string }
        Returns: boolean
      }
      fn_is_active_club_member: {
        Args: { target_club_id: string }
        Returns: boolean
      }
      fn_is_club_creator: { Args: { target_club_id: string }; Returns: boolean }
      fn_is_event_organizer: {
        Args: { target_event_id: string }
        Returns: boolean
      }
      fn_is_event_registered: {
        Args: { target_event_id: string }
        Returns: boolean
      }
      fn_is_match_participant: {
        Args: { target_match_id: string }
        Returns: boolean
      }
      get_club_match_stats: {
        Args: { p_club_id: string }
        Returns: {
          active_member_count: number
          matches_this_month: number
        }[]
      }
      get_player_match_stats: {
        Args: { p_player_id: string }
        Returns: {
          doubles_matches: number
          losses: number
          matches_this_month: number
          singles_matches: number
          total_matches: number
          wins: number
        }[]
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
    Enums: {},
  },
} as const
