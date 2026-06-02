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
      account_type_requests: {
        Row: {
          admin_note: string | null
          business_cert_urls: string[]
          business_name: string
          business_number: string | null
          contact_phone: string | null
          extra_docs_urls: string[]
          id: string
          intro: string | null
          license_urls: string[]
          office_address: string
          previous_type: string | null
          requested_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          business_cert_urls?: string[]
          business_name: string
          business_number?: string | null
          contact_phone?: string | null
          extra_docs_urls?: string[]
          id?: string
          intro?: string | null
          license_urls?: string[]
          office_address: string
          previous_type?: string | null
          requested_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          business_cert_urls?: string[]
          business_name?: string
          business_number?: string | null
          contact_phone?: string | null
          extra_docs_urls?: string[]
          id?: string
          intro?: string | null
          license_urls?: string[]
          office_address?: string
          previous_type?: string | null
          requested_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_type_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_type_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_type_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_type_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_actions: {
        Row: {
          action: string
          admin_id: string
          before_data: Json | null
          created_at: string
          id: number
          plaza_id: string | null
          reason: string | null
          target_id: string
          target_table: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          before_data?: Json | null
          created_at?: string
          id?: number
          plaza_id?: string | null
          reason?: string | null
          target_id: string
          target_table: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          before_data?: Json | null
          created_at?: string
          id?: number
          plaza_id?: string | null
          reason?: string | null
          target_id?: string
          target_table?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_backup_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          detail: Json | null
          id: string
          status: string
          target: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          status?: string
          target?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          status?: string
          target?: string | null
        }
        Relationships: []
      }
      admin_mail_log: {
        Row: {
          admin_id: string | null
          body: string
          channel: string
          created_at: string
          failed: number
          id: string
          recipients: number
          subject: string | null
          success: number
          target_type: string
          target_value: string | null
        }
        Insert: {
          admin_id?: string | null
          body: string
          channel?: string
          created_at?: string
          failed?: number
          id?: string
          recipients?: number
          subject?: string | null
          success?: number
          target_type?: string
          target_value?: string | null
        }
        Update: {
          admin_id?: string | null
          body?: string
          channel?: string
          created_at?: string
          failed?: number
          id?: string
          recipients?: number
          subject?: string | null
          success?: number
          target_type?: string
          target_value?: string | null
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          can_delete: boolean | null
          can_read: boolean | null
          can_write: boolean | null
          created_at: string | null
          id: string
          menu_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          can_delete?: boolean | null
          can_read?: boolean | null
          can_write?: boolean | null
          created_at?: string | null
          id?: string
          menu_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          can_delete?: boolean | null
          can_read?: boolean | null
          can_write?: boolean | null
          created_at?: string | null
          id?: string
          menu_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_permissions_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_permissions_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_video_jobs: {
        Row: {
          beta_free: boolean
          bgm_url: string | null
          clips: Json | null
          completed_at: string | null
          compose_url: string | null
          created_at: string
          credits_refunded: boolean
          credits_used: number
          duration_seconds: number | null
          error_message: string | null
          id: string
          input: Json
          provider: string | null
          provider_job_id: string | null
          provider_request_id: string | null
          result_url: string | null
          script_text: string | null
          stage: string | null
          status: string
          subtitle_ass_url: string | null
          subtitle_segments: Json | null
          thumbnail_url: string | null
          tts_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          beta_free?: boolean
          bgm_url?: string | null
          clips?: Json | null
          completed_at?: string | null
          compose_url?: string | null
          created_at?: string
          credits_refunded?: boolean
          credits_used?: number
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          input: Json
          provider?: string | null
          provider_job_id?: string | null
          provider_request_id?: string | null
          result_url?: string | null
          script_text?: string | null
          stage?: string | null
          status?: string
          subtitle_ass_url?: string | null
          subtitle_segments?: Json | null
          thumbnail_url?: string | null
          tts_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          beta_free?: boolean
          bgm_url?: string | null
          clips?: Json | null
          completed_at?: string | null
          compose_url?: string | null
          created_at?: string
          credits_refunded?: boolean
          credits_used?: number
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          input?: Json
          provider?: string | null
          provider_job_id?: string | null
          provider_request_id?: string | null
          result_url?: string | null
          script_text?: string | null
          stage?: string | null
          status?: string
          subtitle_ass_url?: string | null
          subtitle_segments?: Json | null
          thumbnail_url?: string | null
          tts_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: number
          ip: unknown
          metadata: Json | null
          plaza_id: string
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          plaza_id: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          plaza_id?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      block_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      board_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          plaza_id: string | null
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          plaza_id?: string | null
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          plaza_id?: string | null
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      board_comments: {
        Row: {
          author_avatar: string | null
          author_name: string | null
          content: string
          created_at: string | null
          hidden_reason: string | null
          id: string
          images: string[] | null
          like_count: number | null
          parent_id: string | null
          plaza_id: string | null
          post_id: string
          report_count: number
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          author_avatar?: string | null
          author_name?: string | null
          content: string
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          images?: string[] | null
          like_count?: number | null
          parent_id?: string | null
          plaza_id?: string | null
          post_id: string
          report_count?: number
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          author_avatar?: string | null
          author_name?: string | null
          content?: string
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          images?: string[] | null
          like_count?: number | null
          parent_id?: string | null
          plaza_id?: string | null
          post_id?: string
          report_count?: number
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "board_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_comments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "board_comments_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_post_likes: {
        Row: {
          created_at: string | null
          id: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_post_likes_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "board_post_likes_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_posts: {
        Row: {
          author_avatar: string | null
          author_name: string | null
          category_id: string
          comment_count: number | null
          content: string
          created_at: string | null
          hidden_reason: string | null
          id: string
          images: string[] | null
          is_pinned: boolean | null
          like_count: number | null
          plaza_id: string | null
          region: string | null
          region_id: string | null
          report_count: number
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          user_id: string
          view_count: number | null
        }
        Insert: {
          author_avatar?: string | null
          author_name?: string | null
          category_id: string
          comment_count?: number | null
          content: string
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          images?: string[] | null
          is_pinned?: boolean | null
          like_count?: number | null
          plaza_id?: string | null
          region?: string | null
          region_id?: string | null
          report_count?: number
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          user_id: string
          view_count?: number | null
        }
        Update: {
          author_avatar?: string | null
          author_name?: string | null
          category_id?: string
          comment_count?: number | null
          content?: string
          created_at?: string | null
          hidden_reason?: string | null
          id?: string
          images?: string[] | null
          is_pinned?: boolean | null
          like_count?: number | null
          plaza_id?: string | null
          region?: string | null
          region_id?: string | null
          report_count?: number
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "board_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "board_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "board_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boost_orders: {
        Row: {
          amount: number
          created_at: string
          ends_at: string
          free_period: boolean
          id: string
          payment_id: string | null
          plaza_id: string
          starts_at: string
          status: string
          target_id: string
          target_type: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          ends_at: string
          free_period?: boolean
          id?: string
          payment_id?: string | null
          plaza_id: string
          starts_at?: string
          status?: string
          target_id: string
          target_type: string
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          ends_at?: string
          free_period?: boolean
          id?: string
          payment_id?: string | null
          plaza_id?: string
          starts_at?: string
          status?: string
          target_id?: string
          target_type?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boost_orders_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      boost_pricing: {
        Row: {
          applicable_targets: string[]
          description: string | null
          display_name: string
          duration_days: number
          is_active: boolean
          price: number
          sort_order: number
          tier: string
        }
        Insert: {
          applicable_targets: string[]
          description?: string | null
          display_name: string
          duration_days: number
          is_active?: boolean
          price: number
          sort_order?: number
          tier: string
        }
        Update: {
          applicable_targets?: string[]
          description?: string | null
          display_name?: string
          duration_days?: number
          is_active?: boolean
          price?: number
          sort_order?: number
          tier?: string
        }
        Relationships: []
      }
      bump_daily: {
        Row: {
          date: string
          free_used: number
          paid_used: number
          plaza_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          date: string
          free_used?: number
          paid_used?: number
          plaza_id: string
          target_type: string
          user_id: string
        }
        Update: {
          date?: string
          free_used?: number
          paid_used?: number
          plaza_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      bump_history: {
        Row: {
          cost_krw: number
          cost_points: number
          created_at: string
          id: string
          payment: string
          payment_id: string | null
          plaza_id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          cost_krw?: number
          cost_points?: number
          created_at?: string
          id?: string
          payment: string
          payment_id?: string | null
          plaza_id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          cost_krw?: number
          cost_points?: number
          created_at?: string
          id?: string
          payment?: string
          payment_id?: string | null
          plaza_id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      bump_settings: {
        Row: {
          cooldown_seconds: number
          enabled: boolean
          free_per_day: number
          krw_cost: number
          points_cost: number
          required_account_age_days: number
          target_type: string
          updated_at: string
        }
        Insert: {
          cooldown_seconds?: number
          enabled?: boolean
          free_per_day?: number
          krw_cost?: number
          points_cost?: number
          required_account_age_days?: number
          target_type: string
          updated_at?: string
        }
        Update: {
          cooldown_seconds?: number
          enabled?: boolean
          free_per_day?: number
          krw_cost?: number
          points_cost?: number
          required_account_age_days?: number
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      bump_ticket_orders: {
        Row: {
          cost_krw: number
          cost_points: number
          created_at: string
          id: string
          pack_id: string
          payment: string
          payment_id: string | null
          plaza_id: string
          qty: number
          user_id: string
        }
        Insert: {
          cost_krw?: number
          cost_points?: number
          created_at?: string
          id?: string
          pack_id: string
          payment: string
          payment_id?: string | null
          plaza_id: string
          qty: number
          user_id: string
        }
        Update: {
          cost_krw?: number
          cost_points?: number
          created_at?: string
          id?: string
          pack_id?: string
          payment?: string
          payment_id?: string | null
          plaza_id?: string
          qty?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bump_ticket_orders_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "bump_ticket_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      bump_ticket_packs: {
        Row: {
          description: string | null
          display_label: string
          enabled: boolean
          id: string
          krw_price: number
          points_price: number
          size: number
          sort_order: number
        }
        Insert: {
          description?: string | null
          display_label: string
          enabled?: boolean
          id: string
          krw_price: number
          points_price: number
          size: number
          sort_order?: number
        }
        Update: {
          description?: string | null
          display_label?: string
          enabled?: boolean
          id?: string
          krw_price?: number
          points_price?: number
          size?: number
          sort_order?: number
        }
        Relationships: []
      }
      bump_tickets: {
        Row: {
          balance: number
          lifetime_purchased: number
          lifetime_used: number
          plaza_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          lifetime_purchased?: number
          lifetime_used?: number
          plaza_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          lifetime_purchased?: number
          lifetime_used?: number
          plaza_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      business_declarations: {
        Row: {
          business_address: string | null
          business_category: string | null
          business_name: string
          business_number: string
          ceo_name: string | null
          created_at: string
          doc_url: string | null
          id: string
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          business_address?: string | null
          business_category?: string | null
          business_name: string
          business_number: string
          ceo_name?: string | null
          created_at?: string
          doc_url?: string | null
          id?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          business_address?: string | null
          business_category?: string | null
          business_name?: string
          business_number?: string
          ceo_name?: string | null
          created_at?: string
          doc_url?: string | null
          id?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          order_index: number | null
          parent_id: string | null
          slug: string | null
          sort_order: number
          type: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          order_index?: number | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          type: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          order_index?: number | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_participants: {
        Row: {
          id: string
          joined_at: string | null
          role: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_room_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_participants_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_room_participants_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          buyer_id: string
          buyer_plaza_id: string | null
          created_at: string | null
          id: string
          last_message: string | null
          last_message_at: string | null
          max_participants: number | null
          plaza_id: string | null
          post_type: string | null
          property_id: string | null
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          buyer_id: string
          buyer_plaza_id?: string | null
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          max_participants?: number | null
          plaza_id?: string | null
          post_type?: string | null
          property_id?: string | null
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string
          buyer_plaza_id?: string | null
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          max_participants?: number | null
          plaza_id?: string | null
          post_type?: string | null
          property_id?: string | null
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_buyer_plaza_id_fkey"
            columns: ["buyer_plaza_id"]
            isOneToOne: false
            referencedRelation: "plazas"
            referencedColumns: ["id"]
          },
        ]
      }
      chuncheon_events: {
        Row: {
          category: string
          color: string | null
          created_at: string
          description: string | null
          end_date: string | null
          event_date: string
          external_id: string | null
          id: string
          is_active: boolean
          link_url: string | null
          location: string | null
          plaza_id: string | null
          source: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          color?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_date: string
          external_id?: string | null
          id?: string
          is_active?: boolean
          link_url?: string | null
          location?: string | null
          plaza_id?: string | null
          source?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_date?: string
          external_id?: string | null
          id?: string
          is_active?: boolean
          link_url?: string | null
          location?: string | null
          plaza_id?: string | null
          source?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cleaning_favorites: {
        Row: {
          created_at: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_favorites_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "cleaning_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_posts: {
        Row: {
          bumped_at: string | null
          career_years: number | null
          category: string
          contact_phone: string | null
          content: string
          created_at: string | null
          effective_at: string | null
          id: string
          images: string[] | null
          lat: number | null
          likes: number | null
          lng: number | null
          max_price: number | null
          min_price: number | null
          plaza_id: string | null
          price_unit: string | null
          region_id: string | null
          service_district: string | null
          service_dong: string | null
          service_region: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
          views: number | null
        }
        Insert: {
          bumped_at?: string | null
          career_years?: number | null
          category?: string
          contact_phone?: string | null
          content: string
          created_at?: string | null
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          max_price?: number | null
          min_price?: number | null
          plaza_id?: string | null
          price_unit?: string | null
          region_id?: string | null
          service_district?: string | null
          service_dong?: string | null
          service_region?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
          views?: number | null
        }
        Update: {
          bumped_at?: string | null
          career_years?: number | null
          category?: string
          contact_phone?: string | null
          content?: string
          created_at?: string | null
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          max_price?: number | null
          min_price?: number | null
          plaza_id?: string | null
          price_unit?: string | null
          region_id?: string | null
          service_district?: string | null
          service_dong?: string | null
          service_region?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cleaning_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cleaning_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_chat_messages: {
        Row: {
          club_id: string
          content: string | null
          created_at: string
          id: string
          image_url: string | null
          plaza_id: string | null
          user_id: string
        }
        Insert: {
          club_id: string
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          plaza_id?: string | null
          user_id: string
        }
        Update: {
          club_id?: string
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          plaza_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_chat_messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_chat_messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "my_club_chat_rooms"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "club_chat_messages_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "club_chat_messages_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_likes: {
        Row: {
          club_id: string | null
          created_at: string | null
          id: string
          plaza_id: string | null
          user_id: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          user_id?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_likes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_likes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "my_club_chat_rooms"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "club_likes_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "club_likes_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_members: {
        Row: {
          club_id: string
          joined_at: string
          last_read_at: string
          plaza_id: string | null
          user_id: string
        }
        Insert: {
          club_id: string
          joined_at?: string
          last_read_at?: string
          plaza_id?: string | null
          user_id: string
        }
        Update: {
          club_id?: string
          joined_at?: string
          last_read_at?: string
          plaza_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "my_club_chat_rooms"
            referencedColumns: ["club_id"]
          },
          {
            foreignKeyName: "club_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "club_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          category: string
          content: string | null
          created_at: string | null
          current_members: number | null
          description: string | null
          district: string | null
          id: string
          images: string[] | null
          lat: number | null
          like_count: number | null
          lng: number | null
          location: string | null
          max_members: number | null
          meeting_date: string | null
          meeting_time: string | null
          plaza_id: string | null
          region_id: string | null
          skill_level: string | null
          sport_type: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
          view_count: number | null
        }
        Insert: {
          category?: string
          content?: string | null
          created_at?: string | null
          current_members?: number | null
          description?: string | null
          district?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          like_count?: number | null
          lng?: number | null
          location?: string | null
          max_members?: number | null
          meeting_date?: string | null
          meeting_time?: string | null
          plaza_id?: string | null
          region_id?: string | null
          skill_level?: string | null
          sport_type?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
          view_count?: number | null
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string | null
          current_members?: number | null
          description?: string | null
          district?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          like_count?: number | null
          lng?: number | null
          location?: string | null
          max_members?: number | null
          meeting_date?: string | null
          meeting_time?: string | null
          plaza_id?: string | null
          region_id?: string | null
          skill_level?: string | null
          sport_type?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clubs_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settings: {
        Row: {
          category: string
          description: string | null
          is_active: boolean
          rate_pct: number
          updated_at: string
        }
        Insert: {
          category: string
          description?: string | null
          is_active?: boolean
          rate_pct: number
          updated_at?: string
        }
        Update: {
          category?: string
          description?: string | null
          is_active?: boolean
          rate_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      commission_splits: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string
          payout_id: string | null
          plaza_id: string | null
          rate_pct: number | null
          recipient_id: string | null
          recipient_type: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_id: string
          payout_id?: string | null
          plaza_id?: string | null
          rate_pct?: number | null
          recipient_id?: string | null
          recipient_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string
          payout_id?: string | null
          plaza_id?: string | null
          rate_pct?: number | null
          recipient_id?: string | null
          recipient_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_splits_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_purchases: {
        Row: {
          amount_krw: number
          created_at: string
          credits_granted: number
          id: string
          order_id: string
          paid_at: string | null
          payment_key: string | null
          product_code: string
          provider: string
          raw_response: Json | null
          status: string
          user_id: string
        }
        Insert: {
          amount_krw: number
          created_at?: string
          credits_granted: number
          id?: string
          order_id: string
          paid_at?: string | null
          payment_key?: string | null
          product_code: string
          provider: string
          raw_response?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          amount_krw?: number
          created_at?: string
          credits_granted?: number
          id?: string
          order_id?: string
          paid_at?: string | null
          payment_key?: string | null
          product_code?: string
          provider?: string
          raw_response?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      cron_run_log: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          job_name: string
          result: Json | null
          started_at: string
          status: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      expert_invitations: {
        Row: {
          chat_room_id: string
          created_at: string | null
          expert_id: string
          id: string
          inviter_id: string
          message: string | null
          property_id: string | null
          responded_at: string | null
          status: string
        }
        Insert: {
          chat_room_id: string
          created_at?: string | null
          expert_id: string
          id?: string
          inviter_id: string
          message?: string | null
          property_id?: string | null
          responded_at?: string | null
          status?: string
        }
        Update: {
          chat_room_id?: string
          created_at?: string | null
          expert_id?: string
          id?: string
          inviter_id?: string
          message?: string | null
          property_id?: string | null
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_invitations_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_invitations_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expert_invitations_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expert_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_invitations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          plaza_id: string | null
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          plaza_id?: string | null
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          plaza_id?: string | null
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string | null
          id: string
          plaza_id: string | null
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "favorites_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          plaza_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          plaza_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          plaza_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_plaza_id_fkey"
            columns: ["plaza_id"]
            isOneToOne: false
            referencedRelation: "plazas"
            referencedColumns: ["id"]
          },
        ]
      }
      group_buying_chat_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          image_url: string | null
          plaza_id: string | null
          post_id: string
          system_type: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          plaza_id?: string | null
          post_id: string
          system_type?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          plaza_id?: string | null
          post_id?: string
          system_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_buying_chat_messages_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_buying_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buying_chat_messages_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "my_group_buying_chat_rooms"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "group_buying_chat_messages_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_buying_chat_messages_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_buying_orders: {
        Row: {
          amount: number
          buyer_id: string
          buyer_memo: string | null
          buyer_plaza_id: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          delivery_addr: Json | null
          fee_amount: number
          group_confirmed_at: string | null
          id: string
          idempotency_key: string | null
          paid_at: string | null
          pg_merchant_uid: string
          pg_payment_id: string | null
          pg_provider: string
          pg_raw: Json | null
          plaza_id: string
          points_tx_id: string | null
          points_used: number
          post_id: string
          quantity: number
          receive_method: string
          received_at: string | null
          refund_reason: string | null
          refunded_at: string | null
          seller_id: string
          settled_at: string | null
          settlement_amount: number | null
          shipped_at: string | null
          status: string
          tracking_company: string | null
          tracking_number: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_id: string
          buyer_memo?: string | null
          buyer_plaza_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivery_addr?: Json | null
          fee_amount?: number
          group_confirmed_at?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          pg_merchant_uid: string
          pg_payment_id?: string | null
          pg_provider?: string
          pg_raw?: Json | null
          plaza_id: string
          points_tx_id?: string | null
          points_used?: number
          post_id: string
          quantity?: number
          receive_method: string
          received_at?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          seller_id: string
          settled_at?: string | null
          settlement_amount?: number | null
          shipped_at?: string | null
          status?: string
          tracking_company?: string | null
          tracking_number?: string | null
          unit_price: number
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          buyer_memo?: string | null
          buyer_plaza_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivery_addr?: Json | null
          fee_amount?: number
          group_confirmed_at?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          pg_merchant_uid?: string
          pg_payment_id?: string | null
          pg_provider?: string
          pg_raw?: Json | null
          plaza_id?: string
          points_tx_id?: string | null
          points_used?: number
          post_id?: string
          quantity?: number
          receive_method?: string
          received_at?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          seller_id?: string
          settled_at?: string | null
          settlement_amount?: number | null
          shipped_at?: string | null
          status?: string
          tracking_company?: string | null
          tracking_number?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_buying_orders_buyer_plaza_id_fkey"
            columns: ["buyer_plaza_id"]
            isOneToOne: false
            referencedRelation: "plazas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buying_orders_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_buying_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buying_orders_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "my_group_buying_chat_rooms"
            referencedColumns: ["post_id"]
          },
        ]
      }
      group_buying_participants: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          id: string
          joined_at: string | null
          last_read_at: string
          paid_at: string | null
          payment_status: string
          post_id: string
          quantity: number
          receive_method: string
          received_at: string | null
          recipient_address: string | null
          recipient_address_detail: string | null
          recipient_name: string | null
          recipient_phone: string | null
          refunded_at: string | null
          shipped_at: string | null
          tracking_carrier: string | null
          tracking_company: string | null
          tracking_number: string | null
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          id?: string
          joined_at?: string | null
          last_read_at?: string
          paid_at?: string | null
          payment_status?: string
          post_id: string
          quantity?: number
          receive_method?: string
          received_at?: string | null
          recipient_address?: string | null
          recipient_address_detail?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          refunded_at?: string | null
          shipped_at?: string | null
          tracking_carrier?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          id?: string
          joined_at?: string | null
          last_read_at?: string
          paid_at?: string | null
          payment_status?: string
          post_id?: string
          quantity?: number
          receive_method?: string
          received_at?: string | null
          recipient_address?: string | null
          recipient_address_detail?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          refunded_at?: string | null
          shipped_at?: string | null
          tracking_carrier?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_group_buying_participants_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_group_buying_participants_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buying_participants_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_buying_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buying_participants_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "my_group_buying_chat_rooms"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "group_buying_participants_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_buying_participants_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_buying_posts: {
        Row: {
          account_info: string | null
          auto_processed_at: string | null
          bumped_at: string | null
          created_at: string | null
          current_participants: number | null
          deadline: string | null
          delivery_fee: number
          delivery_fee_mode: string
          delivery_mode: string
          description: string
          effective_at: string | null
          group_price: number
          id: string
          images: string[] | null
          location: string | null
          max_participants: number | null
          min_participants: number
          original_price: number | null
          payment_required: boolean
          pickup_location: string | null
          pickup_time: string | null
          plaza_id: string | null
          product_name: string
          region_id: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string
          views: number | null
          visibility: string
        }
        Insert: {
          account_info?: string | null
          auto_processed_at?: string | null
          bumped_at?: string | null
          created_at?: string | null
          current_participants?: number | null
          deadline?: string | null
          delivery_fee?: number
          delivery_fee_mode?: string
          delivery_mode?: string
          description: string
          effective_at?: string | null
          group_price: number
          id?: string
          images?: string[] | null
          location?: string | null
          max_participants?: number | null
          min_participants?: number
          original_price?: number | null
          payment_required?: boolean
          pickup_location?: string | null
          pickup_time?: string | null
          plaza_id?: string | null
          product_name: string
          region_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
          views?: number | null
          visibility?: string
        }
        Update: {
          account_info?: string | null
          auto_processed_at?: string | null
          bumped_at?: string | null
          created_at?: string | null
          current_participants?: number | null
          deadline?: string | null
          delivery_fee?: number
          delivery_fee_mode?: string
          delivery_mode?: string
          description?: string
          effective_at?: string | null
          group_price?: number
          id?: string
          images?: string[] | null
          location?: string | null
          max_participants?: number | null
          min_participants?: number
          original_price?: number | null
          payment_required?: boolean
          pickup_location?: string | null
          pickup_time?: string | null
          plaza_id?: string | null
          product_name?: string
          region_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          views?: number | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_buying_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buying_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_buying_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_buying_wishlist: {
        Row: {
          created_at: string | null
          id: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_buying_wishlist_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_buying_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buying_wishlist_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "my_group_buying_chat_rooms"
            referencedColumns: ["post_id"]
          },
          {
            foreignKeyName: "group_buying_wishlist_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_buying_wishlist_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hero_banners: {
        Row: {
          created_at: string
          description: string | null
          end_at: string | null
          font_family: string | null
          gradient: string
          href: string
          icon: string
          id: string
          image_url: string | null
          is_active: boolean
          link_url: string | null
          logo_image_url: string | null
          opacity: number | null
          order_index: number
          plaza_id: string | null
          sort_order: number
          start_at: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_at?: string | null
          font_family?: string | null
          gradient?: string
          href: string
          icon?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          logo_image_url?: string | null
          opacity?: number | null
          order_index?: number
          plaza_id?: string | null
          sort_order?: number
          start_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_at?: string | null
          font_family?: string | null
          gradient?: string
          href?: string
          icon?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          logo_image_url?: string | null
          opacity?: number | null
          order_index?: number
          plaza_id?: string | null
          sort_order?: number
          start_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      homepage_menu: {
        Row: {
          created_at: string
          href: string
          icon: string | null
          id: string
          is_active: boolean
          label: string
          parent_id: string | null
          plaza_id: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          href: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          parent_id?: string | null
          plaza_id?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          href?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          parent_id?: string | null
          plaza_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "homepage_menu_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "homepage_menu"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_slider: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          plaza_id: string | null
          sort_order: number
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          plaza_id?: string | null
          sort_order?: number
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          plaza_id?: string | null
          sort_order?: number
          title?: string | null
        }
        Relationships: []
      }
      interior_favorites: {
        Row: {
          created_at: string | null
          id: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interior_favorites_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "interior_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interior_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "interior_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interior_favorites_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "interior_favorites_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interior_posts: {
        Row: {
          bumped_at: string | null
          career_years: number | null
          category: string
          contact_phone: string | null
          content: string
          created_at: string | null
          effective_at: string | null
          id: string
          images: string[] | null
          lat: number | null
          likes: number | null
          lng: number | null
          max_price: number | null
          min_price: number | null
          plaza_id: string | null
          price_unit: string | null
          region_id: string | null
          service_district: string | null
          service_dong: string | null
          service_region: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
          views: number | null
        }
        Insert: {
          bumped_at?: string | null
          career_years?: number | null
          category?: string
          contact_phone?: string | null
          content: string
          created_at?: string | null
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          max_price?: number | null
          min_price?: number | null
          plaza_id?: string | null
          price_unit?: string | null
          region_id?: string | null
          service_district?: string | null
          service_dong?: string | null
          service_region?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
          views?: number | null
        }
        Update: {
          bumped_at?: string | null
          career_years?: number | null
          category?: string
          contact_phone?: string | null
          content?: string
          created_at?: string | null
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          max_price?: number | null
          min_price?: number | null
          plaza_id?: string | null
          price_unit?: string | null
          region_id?: string | null
          service_district?: string | null
          service_dong?: string | null
          service_region?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "interior_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interior_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "interior_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interior_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "interior_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs_likes: {
        Row: {
          created_at: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "jobs_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs_posts: {
        Row: {
          bumped_at: string | null
          category: string
          contact: string | null
          created_at: string
          description: string
          effective_at: string | null
          hidden_reason: string | null
          hourly_wage: number
          id: string
          images: Json | null
          kind: string
          lat: number | null
          likes: number
          lng: number | null
          location: string | null
          plaza_id: string | null
          region_id: string | null
          report_count: number
          status: string
          title: string
          updated_at: string
          user_id: string
          views: number
          work_days: string | null
          work_hours: string | null
          work_type: string | null
        }
        Insert: {
          bumped_at?: string | null
          category?: string
          contact?: string | null
          created_at?: string
          description: string
          effective_at?: string | null
          hidden_reason?: string | null
          hourly_wage: number
          id?: string
          images?: Json | null
          kind?: string
          lat?: number | null
          likes?: number
          lng?: number | null
          location?: string | null
          plaza_id?: string | null
          region_id?: string | null
          report_count?: number
          status?: string
          title: string
          updated_at?: string
          user_id: string
          views?: number
          work_days?: string | null
          work_hours?: string | null
          work_type?: string | null
        }
        Update: {
          bumped_at?: string | null
          category?: string
          contact?: string | null
          created_at?: string
          description?: string
          effective_at?: string | null
          hidden_reason?: string | null
          hourly_wage?: number
          id?: string
          images?: Json | null
          kind?: string
          lat?: number | null
          likes?: number
          lng?: number | null
          location?: string | null
          plaza_id?: string | null
          region_id?: string | null
          report_count?: number
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          views?: number
          work_days?: string | null
          work_hours?: string | null
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      local_food: {
        Row: {
          bumped_at: string | null
          category: string | null
          content: string | null
          created_at: string | null
          description: string | null
          district: string | null
          effective_at: string | null
          farm_name: string | null
          free_shipping: boolean
          id: string
          images: string[] | null
          like_count: number | null
          location: string | null
          original_price: number | null
          plaza_id: string | null
          price: number | null
          region_id: string | null
          shipping_fee: number
          status: string | null
          title: string
          unit: string | null
          updated_at: string | null
          user_id: string
          view_count: number | null
          visibility: string
        }
        Insert: {
          bumped_at?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          district?: string | null
          effective_at?: string | null
          farm_name?: string | null
          free_shipping?: boolean
          id?: string
          images?: string[] | null
          like_count?: number | null
          location?: string | null
          original_price?: number | null
          plaza_id?: string | null
          price?: number | null
          region_id?: string | null
          shipping_fee?: number
          status?: string | null
          title: string
          unit?: string | null
          updated_at?: string | null
          user_id: string
          view_count?: number | null
          visibility?: string
        }
        Update: {
          bumped_at?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          district?: string | null
          effective_at?: string | null
          farm_name?: string | null
          free_shipping?: boolean
          id?: string
          images?: string[] | null
          like_count?: number | null
          location?: string | null
          original_price?: number | null
          plaza_id?: string | null
          price?: number | null
          region_id?: string | null
          shipping_fee?: number
          status?: string | null
          title?: string
          unit?: string | null
          updated_at?: string | null
          user_id?: string
          view_count?: number | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_food_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_food_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "local_food_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      local_food_likes: {
        Row: {
          created_at: string | null
          id: string
          local_food_id: string | null
          plaza_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          local_food_id?: string | null
          plaza_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          local_food_id?: string | null
          plaza_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "local_food_likes_local_food_id_fkey"
            columns: ["local_food_id"]
            isOneToOne: false
            referencedRelation: "local_food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_food_likes_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "local_food_likes_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      local_food_order_items: {
        Row: {
          created_at: string
          id: string
          local_food_id: string
          order_id: string
          quantity: number
          subtotal: number | null
          thumbnail_url: string | null
          title: string
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          local_food_id: string
          order_id: string
          quantity: number
          subtotal?: number | null
          thumbnail_url?: string | null
          title: string
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          local_food_id?: string
          order_id?: string
          quantity?: number
          subtotal?: number | null
          thumbnail_url?: string | null
          title?: string
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "local_food_order_items_local_food_id_fkey"
            columns: ["local_food_id"]
            isOneToOne: false
            referencedRelation: "local_food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_food_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "local_food_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      local_food_orders: {
        Row: {
          amount: number
          buyer_id: string
          buyer_memo: string | null
          buyer_plaza_id: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          delivered_at: string | null
          delivery_addr: Json
          fee_amount: number
          id: string
          idempotency_key: string | null
          paid_at: string | null
          pg_merchant_uid: string
          pg_payment_id: string | null
          pg_provider: string
          pg_raw: Json | null
          plaza_id: string
          points_tx_id: string | null
          points_used: number
          received_at: string | null
          refund_requested_at: string | null
          refunded_at: string | null
          seller_id: string
          seller_memo: string | null
          settled_at: string | null
          settlement_amount: number | null
          shipped_at: string | null
          status: string
          tracking_company: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_id: string
          buyer_memo?: string | null
          buyer_plaza_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_addr: Json
          fee_amount?: number
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          pg_merchant_uid: string
          pg_payment_id?: string | null
          pg_provider?: string
          pg_raw?: Json | null
          plaza_id: string
          points_tx_id?: string | null
          points_used?: number
          received_at?: string | null
          refund_requested_at?: string | null
          refunded_at?: string | null
          seller_id: string
          seller_memo?: string | null
          settled_at?: string | null
          settlement_amount?: number | null
          shipped_at?: string | null
          status?: string
          tracking_company?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          buyer_memo?: string | null
          buyer_plaza_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_addr?: Json
          fee_amount?: number
          id?: string
          idempotency_key?: string | null
          paid_at?: string | null
          pg_merchant_uid?: string
          pg_payment_id?: string | null
          pg_provider?: string
          pg_raw?: Json | null
          plaza_id?: string
          points_tx_id?: string | null
          points_used?: number
          received_at?: string | null
          refund_requested_at?: string | null
          refunded_at?: string | null
          seller_id?: string
          seller_memo?: string | null
          settled_at?: string | null
          settlement_amount?: number | null
          shipped_at?: string | null
          status?: string
          tracking_company?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_food_orders_buyer_plaza_id_fkey"
            columns: ["buyer_plaza_id"]
            isOneToOne: false
            referencedRelation: "plazas"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_settings: {
        Row: {
          allowed_ips: string[] | null
          end_time: string | null
          id: string
          is_enabled: boolean | null
          message: string | null
          start_time: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          allowed_ips?: string[] | null
          end_time?: string | null
          id?: string
          is_enabled?: boolean | null
          message?: string | null
          start_time?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          allowed_ips?: string[] | null
          end_time?: string | null
          id?: string
          is_enabled?: boolean | null
          message?: string | null
          start_time?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          chat_room_id: string
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          is_system: boolean | null
          plaza_id: string | null
          sender_id: string
        }
        Insert: {
          chat_room_id: string
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          is_system?: boolean | null
          plaza_id?: string | null
          sender_id: string
        }
        Update: {
          chat_room_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          is_system?: boolean | null
          plaza_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_keywords: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          id: string
          keyword: string
          note: string | null
          plaza_id: string | null
          scope: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          keyword: string
          note?: string | null
          plaza_id?: string | null
          scope?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          keyword?: string
          note?: string | null
          plaza_id?: string | null
          scope?: string
        }
        Relationships: []
      }
      moving_favorites: {
        Row: {
          created_at: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moving_favorites_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "moving_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      moving_posts: {
        Row: {
          bumped_at: string | null
          career_years: number | null
          category: string
          contact_phone: string | null
          content: string
          created_at: string | null
          effective_at: string | null
          id: string
          images: string[] | null
          lat: number | null
          likes: number | null
          lng: number | null
          max_price: number | null
          min_price: number | null
          plaza_id: string | null
          price_unit: string | null
          region_id: string | null
          service_district: string | null
          service_dong: string | null
          service_region: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
          views: number | null
        }
        Insert: {
          bumped_at?: string | null
          career_years?: number | null
          category?: string
          contact_phone?: string | null
          content: string
          created_at?: string | null
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          max_price?: number | null
          min_price?: number | null
          plaza_id?: string | null
          price_unit?: string | null
          region_id?: string | null
          service_district?: string | null
          service_dong?: string | null
          service_region?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
          views?: number | null
        }
        Update: {
          bumped_at?: string | null
          career_years?: number | null
          category?: string
          contact_phone?: string | null
          content?: string
          created_at?: string | null
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          max_price?: number | null
          min_price?: number | null
          plaza_id?: string | null
          price_unit?: string | null
          region_id?: string | null
          service_district?: string | null
          service_dong?: string | null
          service_region?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "moving_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moving_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "moving_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moving_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "moving_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      new_store_likes: {
        Row: {
          created_at: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "new_store_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "new_store_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      new_store_posts: {
        Row: {
          address: string
          bumped_at: string | null
          category: string
          created_at: string | null
          description: string
          effective_at: string | null
          id: string
          images: string[] | null
          lat: number | null
          likes: number | null
          lng: number | null
          opening_date: string | null
          opening_event: string | null
          phone: string | null
          plaza_id: string | null
          region_id: string | null
          status: string
          store_name: string
          updated_at: string | null
          user_id: string
          views: number | null
        }
        Insert: {
          address: string
          bumped_at?: string | null
          category: string
          created_at?: string | null
          description: string
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          opening_date?: string | null
          opening_event?: string | null
          phone?: string | null
          plaza_id?: string | null
          region_id?: string | null
          status?: string
          store_name: string
          updated_at?: string | null
          user_id: string
          views?: number | null
        }
        Update: {
          address?: string
          bumped_at?: string | null
          category?: string
          created_at?: string | null
          description?: string
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          opening_date?: string | null
          opening_event?: string | null
          phone?: string | null
          plaza_id?: string | null
          region_id?: string | null
          status?: string
          store_name?: string
          updated_at?: string | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "new_store_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "new_store_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "new_store_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          is_published: boolean
          plaza_id: string | null
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          plaza_id?: string | null
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          plaza_id?: string | null
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "notices_author_id_profiles_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notices_author_id_profiles_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          plaza_id: string | null
          property_id: string | null
          thumbnail_url: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          plaza_id?: string | null
          property_id?: string | null
          thumbnail_url?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          plaza_id?: string | null
          property_id?: string | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_heroes: {
        Row: {
          image_url: string | null
          page_key: string
          plaza_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          image_url?: string | null
          page_key: string
          plaza_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          image_url?: string | null
          page_key?: string
          plaza_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payment_webhooks: {
        Row: {
          created_at: string
          event_type: string
          id: string
          pg_payment_id: string
          pg_provider: string
          processed_at: string | null
          raw_body: Json | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          pg_payment_id: string
          pg_provider: string
          processed_at?: string | null
          raw_body?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          pg_payment_id?: string
          pg_provider?: string
          processed_at?: string | null
          raw_body?: Json | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: string
          memo: string | null
          paid_at: string | null
          pg_method: string | null
          pg_payment_id: string | null
          pg_provider: string | null
          pg_raw_response: Json | null
          plaza_id: string
          receipt_url: string | null
          reference_id: string | null
          reference_type: string | null
          refunded_at: string | null
          status: string
          updated_at: string
          user_id: string | null
          vat_amount: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          kind: string
          memo?: string | null
          paid_at?: string | null
          pg_method?: string | null
          pg_payment_id?: string | null
          pg_provider?: string | null
          pg_raw_response?: Json | null
          plaza_id: string
          receipt_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          refunded_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vat_amount?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          memo?: string | null
          paid_at?: string | null
          pg_method?: string | null
          pg_payment_id?: string | null
          pg_provider?: string | null
          pg_raw_response?: Json | null
          plaza_id?: string
          receipt_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          refunded_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          vat_amount?: number
        }
        Relationships: []
      }
      payout_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          period_end: string
          period_start: string
          plaza_count: number
          started_at: string | null
          status: string
          total_gross_amount: number
          total_hq_amount: number
          total_plaza_amount: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          plaza_count?: number
          started_at?: string | null
          status?: string
          total_gross_amount?: number
          total_hq_amount?: number
          total_plaza_amount?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          plaza_count?: number
          started_at?: string | null
          status?: string
          total_gross_amount?: number
          total_hq_amount?: number
          total_plaza_amount?: number
        }
        Relationships: []
      }
      payouts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account: string | null
          bank_holder: string | null
          bank_name: string | null
          batch_id: string | null
          created_at: string
          gross_amount: number
          hq_fee_amount: number
          id: string
          net_amount: number
          notes: string | null
          period_end: string
          period_start: string
          plaza_association_id: string
          plaza_id: string
          status: string
          tax_invoice_issued: boolean
          tax_invoice_url: string | null
          transfer_method: string
          transfer_reference: string | null
          transferred_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_holder?: string | null
          bank_name?: string | null
          batch_id?: string | null
          created_at?: string
          gross_amount: number
          hq_fee_amount: number
          id?: string
          net_amount: number
          notes?: string | null
          period_end: string
          period_start: string
          plaza_association_id: string
          plaza_id: string
          status?: string
          tax_invoice_issued?: boolean
          tax_invoice_url?: string | null
          transfer_method?: string
          transfer_reference?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_holder?: string | null
          bank_name?: string | null
          batch_id?: string | null
          created_at?: string
          gross_amount?: number
          hq_fee_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          period_end?: string
          period_start?: string
          plaza_association_id?: string
          plaza_id?: string
          status?: string
          tax_invoice_issued?: boolean
          tax_invoice_url?: string | null
          transfer_method?: string
          transfer_reference?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_plaza_association_id_fkey"
            columns: ["plaza_association_id"]
            isOneToOne: false
            referencedRelation: "plaza_associations"
            referencedColumns: ["id"]
          },
        ]
      }
      plaza_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          plaza_id: string
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          plaza_id: string
          role?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          plaza_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaza_admins_plaza_id_fkey"
            columns: ["plaza_id"]
            isOneToOne: false
            referencedRelation: "plazas"
            referencedColumns: ["id"]
          },
        ]
      }
      plaza_associations: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          bank_account: string
          bank_holder: string
          bank_name: string
          bankbook_doc_url: string | null
          business_doc_url: string | null
          business_name: string
          business_number: string
          ceo_name: string
          contact_email: string
          contact_phone: string | null
          created_at: string
          id: string
          notes: string | null
          plaza_id: string
          royalty_rate: number
          status: string
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account: string
          bank_holder: string
          bank_name: string
          bankbook_doc_url?: string | null
          business_doc_url?: string | null
          business_name: string
          business_number: string
          ceo_name: string
          contact_email: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plaza_id: string
          royalty_rate?: number
          status?: string
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string
          bank_holder?: string
          bank_name?: string
          bankbook_doc_url?: string | null
          business_doc_url?: string | null
          business_name?: string
          business_number?: string
          ceo_name?: string
          contact_email?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plaza_id?: string
          royalty_rate?: number
          status?: string
        }
        Relationships: []
      }
      plaza_profiles: {
        Row: {
          account_type: string | null
          avatar_url: string | null
          background_url: string | null
          bio: string | null
          business_hours: string | null
          is_active: boolean
          joined_at: string
          kakao_id: string | null
          location: string | null
          nickname: string | null
          phone: string | null
          plaza_id: string
          region_id: string | null
          review_count: number
          service_areas: string[] | null
          specialties: string[] | null
          sub_region: string | null
          trust_score: number | null
          user_id: string
          website: string | null
        }
        Insert: {
          account_type?: string | null
          avatar_url?: string | null
          background_url?: string | null
          bio?: string | null
          business_hours?: string | null
          is_active?: boolean
          joined_at?: string
          kakao_id?: string | null
          location?: string | null
          nickname?: string | null
          phone?: string | null
          plaza_id: string
          region_id?: string | null
          review_count?: number
          service_areas?: string[] | null
          specialties?: string[] | null
          sub_region?: string | null
          trust_score?: number | null
          user_id: string
          website?: string | null
        }
        Update: {
          account_type?: string | null
          avatar_url?: string | null
          background_url?: string | null
          bio?: string | null
          business_hours?: string | null
          is_active?: boolean
          joined_at?: string
          kakao_id?: string | null
          location?: string | null
          nickname?: string | null
          phone?: string | null
          plaza_id?: string
          region_id?: string | null
          review_count?: number
          service_areas?: string[] | null
          specialties?: string[] | null
          sub_region?: string | null
          trust_score?: number | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plaza_profiles_plaza_id_fkey"
            columns: ["plaza_id"]
            isOneToOne: false
            referencedRelation: "plazas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaza_profiles_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      plazas: {
        Row: {
          bounds: Json | null
          business_holder: string | null
          business_info: Json
          business_name: string | null
          business_number: string | null
          center_lat: number | null
          center_lng: number | null
          coverage: string[] | null
          created_at: string
          id: string
          is_active: boolean
          is_open_soon: boolean
          name: string
          parent_region: string | null
          payments_enabled: boolean
          pg_provider: string | null
          portone_channel_key: string | null
          portone_store_id: string | null
          settlement_email: string | null
          sort_order: number
          theme: Json | null
          tour_area_code: string | null
          tour_sigungu_code: string | null
          updated_at: string
        }
        Insert: {
          bounds?: Json | null
          business_holder?: string | null
          business_info?: Json
          business_name?: string | null
          business_number?: string | null
          center_lat?: number | null
          center_lng?: number | null
          coverage?: string[] | null
          created_at?: string
          id: string
          is_active?: boolean
          is_open_soon?: boolean
          name: string
          parent_region?: string | null
          payments_enabled?: boolean
          pg_provider?: string | null
          portone_channel_key?: string | null
          portone_store_id?: string | null
          settlement_email?: string | null
          sort_order?: number
          theme?: Json | null
          tour_area_code?: string | null
          tour_sigungu_code?: string | null
          updated_at?: string
        }
        Update: {
          bounds?: Json | null
          business_holder?: string | null
          business_info?: Json
          business_name?: string | null
          business_number?: string | null
          center_lat?: number | null
          center_lng?: number | null
          coverage?: string[] | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_open_soon?: boolean
          name?: string
          parent_region?: string | null
          payments_enabled?: boolean
          pg_provider?: string | null
          portone_channel_key?: string | null
          portone_store_id?: string | null
          settlement_email?: string | null
          sort_order?: number
          theme?: Json | null
          tour_area_code?: string | null
          tour_sigungu_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      point_daily_counters: {
        Row: {
          count: number
          date: string
          rule_id: string
          user_id: string
        }
        Insert: {
          count?: number
          date?: string
          rule_id: string
          user_id: string
        }
        Update: {
          count?: number
          date?: string
          rule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_daily_counters_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "point_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      point_history: {
        Row: {
          admin_id: string | null
          amount: number
          balance: number
          created_at: string | null
          expires_at: string | null
          id: string
          reason: string | null
          related_id: string | null
          related_type: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          admin_id?: string | null
          amount: number
          balance: number
          created_at?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          related_id?: string | null
          related_type?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          admin_id?: string | null
          amount?: number
          balance?: number
          created_at?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          related_id?: string | null
          related_type?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "point_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "point_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_history_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "point_history_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      point_redemption_settings: {
        Row: {
          category: string
          daily_limit_pt: number | null
          description: string | null
          display_name: string
          enabled: boolean
          exchange_rate: number
          max_redemption_pct: number
          min_balance_required: number
          required_account_age_days: number
          updated_at: string
        }
        Insert: {
          category: string
          daily_limit_pt?: number | null
          description?: string | null
          display_name: string
          enabled?: boolean
          exchange_rate?: number
          max_redemption_pct?: number
          min_balance_required?: number
          required_account_age_days?: number
          updated_at?: string
        }
        Update: {
          category?: string
          daily_limit_pt?: number | null
          description?: string | null
          display_name?: string
          enabled?: boolean
          exchange_rate?: number
          max_redemption_pct?: number
          min_balance_required?: number
          required_account_age_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      point_rules: {
        Row: {
          amount: number
          cooldown_seconds: number
          daily_cap: number | null
          description: string | null
          display_name: string
          enabled: boolean
          evaluation_period_hours: number
          id: string
          quality_threshold: Json | null
          required_account_age_days: number
          required_email_verified: boolean
          required_phone_verified: boolean
          updated_at: string
          weekly_cap: number | null
        }
        Insert: {
          amount: number
          cooldown_seconds?: number
          daily_cap?: number | null
          description?: string | null
          display_name: string
          enabled?: boolean
          evaluation_period_hours?: number
          id: string
          quality_threshold?: Json | null
          required_account_age_days?: number
          required_email_verified?: boolean
          required_phone_verified?: boolean
          updated_at?: string
          weekly_cap?: number | null
        }
        Update: {
          amount?: number
          cooldown_seconds?: number
          daily_cap?: number | null
          description?: string | null
          display_name?: string
          enabled?: boolean
          evaluation_period_hours?: number
          id?: string
          quality_threshold?: Json | null
          required_account_age_days?: number
          required_email_verified?: boolean
          required_phone_verified?: boolean
          updated_at?: string
          weekly_cap?: number | null
        }
        Relationships: []
      }
      point_transactions: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          evaluation_at: string | null
          id: string
          metadata: Json | null
          plaza_id: string
          reverted_at: string | null
          reverted_reason: string | null
          rule_id: string | null
          source: string
          source_id: string | null
          status: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          evaluation_at?: string | null
          id?: string
          metadata?: Json | null
          plaza_id: string
          reverted_at?: string | null
          reverted_reason?: string | null
          rule_id?: string | null
          source: string
          source_id?: string | null
          status?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          evaluation_at?: string | null
          id?: string
          metadata?: Json | null
          plaza_id?: string
          reverted_at?: string | null
          reverted_reason?: string | null
          rule_id?: string | null
          source?: string
          source_id?: string | null
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      popular_searches: {
        Row: {
          context: string | null
          created_at: string
          id: string
          keyword: string
          plaza_id: string | null
          user_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          id?: string
          keyword: string
          plaza_id?: string | null
          user_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string
          id?: string
          keyword?: string
          plaza_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "popular_searches_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "popular_searches_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      popups: {
        Row: {
          content: string | null
          created_at: string | null
          display_pages: string[] | null
          end_at: string | null
          end_date: string | null
          height: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          plaza_id: string | null
          position: string | null
          position_x: number | null
          position_y: number | null
          show_today_hide: boolean | null
          start_at: string | null
          start_date: string | null
          title: string
          updated_at: string | null
          width: number | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          display_pages?: string[] | null
          end_at?: string | null
          end_date?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          plaza_id?: string | null
          position?: string | null
          position_x?: number | null
          position_y?: number | null
          show_today_hide?: boolean | null
          start_at?: string | null
          start_date?: string | null
          title: string
          updated_at?: string | null
          width?: number | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          display_pages?: string[] | null
          end_at?: string | null
          end_date?: string | null
          height?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          plaza_id?: string | null
          position?: string | null
          position_x?: number | null
          position_y?: number | null
          show_today_hide?: boolean | null
          start_at?: string | null
          start_date?: string | null
          title?: string
          updated_at?: string | null
          width?: number | null
        }
        Relationships: []
      }
      post_reports: {
        Row: {
          created_at: string
          id: string
          plaza_id: string | null
          reason: string
          reason_detail: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
          target_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          plaza_id?: string | null
          reason: string
          reason_detail?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
          target_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          plaza_id?: string | null
          reason?: string
          reason_detail?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      producer_settlements: {
        Row: {
          account_holder: string | null
          bank_account: string | null
          bank_code: string | null
          bank_name: string | null
          business_number: string | null
          created_at: string
          is_verified: boolean
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          account_holder?: string | null
          bank_account?: string | null
          bank_code?: string | null
          bank_name?: string | null
          business_number?: string | null
          created_at?: string
          is_verified?: boolean
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          account_holder?: string | null
          bank_account?: string | null
          bank_code?: string | null
          bank_name?: string | null
          business_number?: string | null
          created_at?: string
          is_verified?: boolean
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      profile_highlights: {
        Row: {
          cover_url: string | null
          created_at: string
          duration_ms: number | null
          id: string
          link_url: string | null
          media_type: string | null
          media_url: string | null
          plaza_id: string
          sort_order: number
          title: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          link_url?: string | null
          media_type?: string | null
          media_url?: string | null
          plaza_id?: string
          sort_order?: number
          title: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          link_url?: string | null
          media_type?: string | null
          media_url?: string | null
          plaza_id?: string
          sort_order?: number
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_highlights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_highlights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string | null
          avatar_url: string | null
          avg_response_minutes: number | null
          bio: string | null
          business_hours: string | null
          completed_deals: number | null
          cover_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          is_admin: boolean | null
          is_verified: boolean | null
          is_verified_business: boolean | null
          is_verified_license: boolean | null
          is_verified_phone: boolean | null
          kakao_id: string | null
          last_seen: string | null
          location: string | null
          nickname: string | null
          notif_chat: boolean
          notif_marketing: boolean
          notif_property: boolean
          phone: string | null
          points: number | null
          posts_public: boolean
          response_rate: number | null
          review_count: number | null
          role: string | null
          service_areas: string[] | null
          specialties: string[] | null
          sub_region: string | null
          trust_score: number | null
          updated_at: string | null
          username: string | null
          verification_type: string | null
          verified_at: string | null
          video_credits: number
          website: string | null
        }
        Insert: {
          account_type?: string | null
          avatar_url?: string | null
          avg_response_minutes?: number | null
          bio?: string | null
          business_hours?: string | null
          completed_deals?: number | null
          cover_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          is_verified_business?: boolean | null
          is_verified_license?: boolean | null
          is_verified_phone?: boolean | null
          kakao_id?: string | null
          last_seen?: string | null
          location?: string | null
          nickname?: string | null
          notif_chat?: boolean
          notif_marketing?: boolean
          notif_property?: boolean
          phone?: string | null
          points?: number | null
          posts_public?: boolean
          response_rate?: number | null
          review_count?: number | null
          role?: string | null
          service_areas?: string[] | null
          specialties?: string[] | null
          sub_region?: string | null
          trust_score?: number | null
          updated_at?: string | null
          username?: string | null
          verification_type?: string | null
          verified_at?: string | null
          video_credits?: number
          website?: string | null
        }
        Update: {
          account_type?: string | null
          avatar_url?: string | null
          avg_response_minutes?: number | null
          bio?: string | null
          business_hours?: string | null
          completed_deals?: number | null
          cover_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          is_verified?: boolean | null
          is_verified_business?: boolean | null
          is_verified_license?: boolean | null
          is_verified_phone?: boolean | null
          kakao_id?: string | null
          last_seen?: string | null
          location?: string | null
          nickname?: string | null
          notif_chat?: boolean
          notif_marketing?: boolean
          notif_property?: boolean
          phone?: string | null
          points?: number | null
          posts_public?: boolean
          response_rate?: number | null
          review_count?: number | null
          role?: string | null
          service_areas?: string[] | null
          specialties?: string[] | null
          sub_region?: string | null
          trust_score?: number | null
          updated_at?: string | null
          username?: string | null
          verification_type?: string | null
          verified_at?: string | null
          video_credits?: number
          website?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          address_detail: string | null
          ai_video_url: string | null
          area_sqm: number
          bathrooms: number | null
          bumped_at: string | null
          created_at: string | null
          description: string | null
          direction: string | null
          effective_at: string | null
          elevator: boolean | null
          features: string[] | null
          floor_info: string | null
          hidden_reason: string | null
          id: string
          images: string[] | null
          instagram_post_url: string | null
          is_featured: boolean | null
          lat: number | null
          latitude: number | null
          lng: number | null
          longitude: number | null
          maintenance_fee: number | null
          monthly_rent: number | null
          move_in_date: string | null
          panorama_images: Json | null
          parking: boolean | null
          pet_allowed: boolean | null
          plaza_id: string | null
          price: number
          property_type: string
          region_id: string | null
          rooms: number | null
          seller_type: string | null
          status: string | null
          title: string
          total_floors: number | null
          transaction_type: string
          updated_at: string | null
          user_id: string
          views: number | null
          youtube_post_url: string | null
        }
        Insert: {
          address: string
          address_detail?: string | null
          ai_video_url?: string | null
          area_sqm: number
          bathrooms?: number | null
          bumped_at?: string | null
          created_at?: string | null
          description?: string | null
          direction?: string | null
          effective_at?: string | null
          elevator?: boolean | null
          features?: string[] | null
          floor_info?: string | null
          hidden_reason?: string | null
          id?: string
          images?: string[] | null
          instagram_post_url?: string | null
          is_featured?: boolean | null
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          longitude?: number | null
          maintenance_fee?: number | null
          monthly_rent?: number | null
          move_in_date?: string | null
          panorama_images?: Json | null
          parking?: boolean | null
          pet_allowed?: boolean | null
          plaza_id?: string | null
          price: number
          property_type: string
          region_id?: string | null
          rooms?: number | null
          seller_type?: string | null
          status?: string | null
          title: string
          total_floors?: number | null
          transaction_type: string
          updated_at?: string | null
          user_id: string
          views?: number | null
          youtube_post_url?: string | null
        }
        Update: {
          address?: string
          address_detail?: string | null
          ai_video_url?: string | null
          area_sqm?: number
          bathrooms?: number | null
          bumped_at?: string | null
          created_at?: string | null
          description?: string | null
          direction?: string | null
          effective_at?: string | null
          elevator?: boolean | null
          features?: string[] | null
          floor_info?: string | null
          hidden_reason?: string | null
          id?: string
          images?: string[] | null
          instagram_post_url?: string | null
          is_featured?: boolean | null
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          longitude?: number | null
          maintenance_fee?: number | null
          monthly_rent?: number | null
          move_in_date?: string | null
          panorama_images?: Json | null
          parking?: boolean | null
          pet_allowed?: boolean | null
          plaza_id?: string | null
          price?: number
          property_type?: string
          region_id?: string | null
          rooms?: number | null
          seller_type?: string | null
          status?: string | null
          title?: string
          total_floors?: number | null
          transaction_type?: string
          updated_at?: string | null
          user_id?: string
          views?: number | null
          youtube_post_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "properties_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_highlights: {
        Row: {
          badge: string | null
          created_at: string
          created_by: string | null
          end_at: string | null
          id: string
          plaza_id: string | null
          property_id: string
          sort_order: number
          start_at: string | null
        }
        Insert: {
          badge?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          plaza_id?: string | null
          property_id: string
          sort_order?: number
          start_at?: string | null
        }
        Update: {
          badge?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          plaza_id?: string | null
          property_id?: string
          sort_order?: number
          start_at?: string | null
        }
        Relationships: []
      }
      property_reports: {
        Row: {
          admin_note: string | null
          created_at: string
          detail: string | null
          id: string
          plaza_id: string | null
          property_id: string
          reason: string
          reporter_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          plaza_id?: string | null
          property_id: string
          reason: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          plaza_id?: string | null
          property_id?: string
          reason?: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      property_request_responses: {
        Row: {
          content: string
          created_at: string
          id: string
          plaza_id: string | null
          property_id: string | null
          request_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          plaza_id?: string | null
          property_id?: string | null
          request_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          plaza_id?: string | null
          property_id?: string | null
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_request_responses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_request_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "property_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      property_requests: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          content: string
          created_at: string
          district: string | null
          dong: string | null
          id: string
          move_in_date: string | null
          plaza_id: string | null
          property_type: string | null
          region: string | null
          region_id: string | null
          status: string
          title: string
          transaction_type: string | null
          updated_at: string
          user_id: string
          views: number
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          content: string
          created_at?: string
          district?: string | null
          dong?: string | null
          id?: string
          move_in_date?: string | null
          plaza_id?: string | null
          property_type?: string | null
          region?: string | null
          region_id?: string | null
          status?: string
          title: string
          transaction_type?: string | null
          updated_at?: string
          user_id: string
          views?: number
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          content?: string
          created_at?: string
          district?: string | null
          dong?: string | null
          id?: string
          move_in_date?: string | null
          plaza_id?: string | null
          property_type?: string | null
          region?: string | null
          region_id?: string | null
          status?: string
          title?: string
          transaction_type?: string | null
          updated_at?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_requests_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          code: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          level: number | null
          name: string
          order_index: number | null
          parent_id: string | null
          plaza_id: string | null
          sort_order: number
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level?: number | null
          name: string
          order_index?: number | null
          parent_id?: string | null
          plaza_id?: string | null
          sort_order?: number
        }
        Update: {
          code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level?: number | null
          name?: string
          order_index?: number | null
          parent_id?: string | null
          plaza_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "regions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_favorites: {
        Row: {
          created_at: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_favorites_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "repair_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_posts: {
        Row: {
          bumped_at: string | null
          career_years: number | null
          category: string
          contact_phone: string | null
          content: string
          created_at: string | null
          effective_at: string | null
          id: string
          images: string[] | null
          lat: number | null
          likes: number | null
          lng: number | null
          max_price: number | null
          min_price: number | null
          plaza_id: string | null
          price_unit: string | null
          region_id: string | null
          service_district: string | null
          service_dong: string | null
          service_region: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
          views: number | null
        }
        Insert: {
          bumped_at?: string | null
          career_years?: number | null
          category?: string
          contact_phone?: string | null
          content: string
          created_at?: string | null
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          max_price?: number | null
          min_price?: number | null
          plaza_id?: string | null
          price_unit?: string | null
          region_id?: string | null
          service_district?: string | null
          service_dong?: string | null
          service_region?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
          views?: number | null
        }
        Update: {
          bumped_at?: string | null
          career_years?: number | null
          category?: string
          contact_phone?: string | null
          content?: string
          created_at?: string | null
          effective_at?: string | null
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          max_price?: number | null
          min_price?: number | null
          plaza_id?: string | null
          price_unit?: string | null
          region_id?: string | null
          service_district?: string | null
          service_dong?: string | null
          service_region?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "repair_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "repair_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          accuracy: number | null
          chat_room_id: string | null
          content: string | null
          created_at: string | null
          id: string
          kindness: number | null
          plaza_id: string
          property_id: string | null
          response_speed: number | null
          reviewed_user_id: string
          reviewer_id: string
          source_id: string | null
          source_type: string | null
          total_score: number | null
          transaction_completed: boolean | null
          updated_at: string | null
        }
        Insert: {
          accuracy?: number | null
          chat_room_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          kindness?: number | null
          plaza_id: string
          property_id?: string | null
          response_speed?: number | null
          reviewed_user_id: string
          reviewer_id: string
          source_id?: string | null
          source_type?: string | null
          total_score?: number | null
          transaction_completed?: boolean | null
          updated_at?: string | null
        }
        Update: {
          accuracy?: number | null
          chat_room_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          kindness?: number | null
          plaza_id?: string
          property_id?: string | null
          response_speed?: number | null
          reviewed_user_id?: string
          reviewer_id?: string
          source_id?: string | null
          source_type?: string | null
          total_score?: number | null
          transaction_completed?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_plaza_id_fkey"
            columns: ["plaza_id"]
            isOneToOne: false
            referencedRelation: "plazas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewed_user_id_fkey"
            columns: ["reviewed_user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_reviewed_user_id_fkey"
            columns: ["reviewed_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          count: number
          first_searched_at: string
          last_searched_at: string
          plaza_id: string | null
          term: string
        }
        Insert: {
          count?: number
          first_searched_at?: string
          last_searched_at?: string
          plaza_id?: string | null
          term: string
        }
        Update: {
          count?: number
          first_searched_at?: string
          last_searched_at?: string
          plaza_id?: string | null
          term?: string
        }
        Relationships: []
      }
      search_term_blacklist: {
        Row: {
          created_at: string
          created_by: string | null
          reason: string | null
          term: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          reason?: string | null
          term: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          reason?: string | null
          term?: string
        }
        Relationships: []
      }
      secondhand_likes: {
        Row: {
          created_at: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "secondhand_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "secondhand_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      secondhand_posts: {
        Row: {
          bumped_at: string | null
          category: string
          condition: string | null
          created_at: string
          description: string
          effective_at: string | null
          hidden_reason: string | null
          id: string
          images: Json | null
          is_price_negotiable: boolean
          lat: number | null
          likes: number
          lng: number | null
          location: string | null
          plaza_id: string | null
          price: number
          region_id: string | null
          report_count: number
          status: string
          title: string
          updated_at: string
          user_id: string
          views: number
        }
        Insert: {
          bumped_at?: string | null
          category?: string
          condition?: string | null
          created_at?: string
          description: string
          effective_at?: string | null
          hidden_reason?: string | null
          id?: string
          images?: Json | null
          is_price_negotiable?: boolean
          lat?: number | null
          likes?: number
          lng?: number | null
          location?: string | null
          plaza_id?: string | null
          price?: number
          region_id?: string | null
          report_count?: number
          status?: string
          title: string
          updated_at?: string
          user_id: string
          views?: number
        }
        Update: {
          bumped_at?: string | null
          category?: string
          condition?: string | null
          created_at?: string
          description?: string
          effective_at?: string | null
          hidden_reason?: string | null
          id?: string
          images?: Json | null
          is_price_negotiable?: boolean
          lat?: number | null
          likes?: number
          lng?: number | null
          location?: string | null
          plaza_id?: string | null
          price?: number
          region_id?: string | null
          report_count?: number
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "secondhand_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      sharing_likes: {
        Row: {
          created_at: string
          plaza_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          plaza_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          plaza_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sharing_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "sharing_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      sharing_posts: {
        Row: {
          category: string
          created_at: string | null
          description: string
          id: string
          images: string[] | null
          lat: number | null
          likes: number | null
          lng: number | null
          location: string | null
          plaza_id: string | null
          region_id: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string
          views: number | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description: string
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          location?: string | null
          plaza_id?: string | null
          region_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
          views?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          images?: string[] | null
          lat?: number | null
          likes?: number | null
          lng?: number | null
          location?: string | null
          plaza_id?: string | null
          region_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sharing_posts_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sharing_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sharing_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_labels: {
        Row: {
          description: string | null
          fallback: string
          group_name: string
          image_url: string | null
          key: string
          max_length: number | null
          recommended_size: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          fallback: string
          group_name?: string
          image_url?: string | null
          key: string
          max_length?: number | null
          recommended_size?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          fallback?: string
          group_name?: string
          image_url?: string | null
          key?: string
          max_length?: number | null
          recommended_size?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json | null
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json | null
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          category: string
          created_at: string
          description: string | null
          early_bird_discount_pct: number
          id: string
          is_active: boolean
          monthly_price: number
          name: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          early_bird_discount_pct?: number
          id: string
          is_active?: boolean
          monthly_price: number
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          early_bird_discount_pct?: number
          id?: string
          is_active?: boolean
          monthly_price?: number
          name?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          applied_discount_pct: number
          billing_key: string | null
          billing_key_provider: string | null
          cancel_reason: string | null
          canceled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          is_early_bird: boolean
          plan_id: string
          plaza_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_discount_pct?: number
          billing_key?: string | null
          billing_key_provider?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          is_early_bird?: boolean
          plan_id: string
          plaza_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_discount_pct?: number
          billing_key?: string | null
          billing_key_provider?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          is_early_bird?: boolean
          plan_id?: string
          plaza_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_inquiries: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          category: string | null
          created_at: string
          email: string | null
          id: string
          message: string
          name: string | null
          phone: string | null
          plaza_id: string | null
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message: string
          name?: string | null
          phone?: string | null
          plaza_id?: string | null
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          name?: string | null
          phone?: string | null
          plaza_id?: string | null
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_inquiries_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "support_inquiries_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          buyer_id: string | null
          commission_amount: number
          commission_rate: number
          completed_at: string | null
          created_at: string
          gross_amount: number
          id: string
          kind: string
          net_amount: number
          payment_id: string | null
          plaza_id: string
          reference_id: string | null
          reference_type: string | null
          seller_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          buyer_id?: string | null
          commission_amount: number
          commission_rate: number
          completed_at?: string | null
          created_at?: string
          gross_amount: number
          id?: string
          kind: string
          net_amount: number
          payment_id?: string | null
          plaza_id: string
          reference_id?: string | null
          reference_type?: string | null
          seller_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string | null
          commission_amount?: number
          commission_rate?: number
          completed_at?: string | null
          created_at?: string
          gross_amount?: number
          id?: string
          kind?: string
          net_amount?: number
          payment_id?: string | null
          plaza_id?: string
          reference_id?: string | null
          reference_type?: string | null
          seller_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          expires_at: string | null
          id: number
          lifted_at: string | null
          lifted_by: string | null
          plaza_id: string
          reason: string | null
          scope: string
          starts_at: string
          user_id: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: number
          lifted_at?: string | null
          lifted_by?: string | null
          plaza_id: string
          reason?: string | null
          scope?: string
          starts_at?: string
          user_id: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: number
          lifted_at?: string | null
          lifted_by?: string | null
          plaza_id?: string
          reason?: string | null
          scope?: string
          starts_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_flags: {
        Row: {
          created_at: string
          flag_type: string
          id: string
          metadata: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          severity: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flag_type: string
          id?: string
          metadata?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          severity?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          flag_type?: string
          id?: string
          metadata?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          severity?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_points: {
        Row: {
          available: number
          is_suspended: boolean
          lifetime_earned: number
          lifetime_reverted: number
          lifetime_spent: number
          pending: number
          plaza_id: string
          reputation_score: number
          suspended_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          available?: number
          is_suspended?: boolean
          lifetime_earned?: number
          lifetime_reverted?: number
          lifetime_spent?: number
          pending?: number
          plaza_id: string
          reputation_score?: number
          suspended_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          available?: number
          is_suspended?: boolean
          lifetime_earned?: number
          lifetime_reverted?: number
          lifetime_spent?: number
          pending?: number
          plaza_id?: string
          reputation_score?: number
          suspended_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_push_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          platform: string
          provider: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          platform: string
          provider?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          platform?: string
          provider?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          address: string | null
          business_license_url: string | null
          business_number: string | null
          business_type: string | null
          certification_type: string | null
          certification_url: string | null
          certifications: string[] | null
          company_name: string | null
          created_at: string | null
          data: Json | null
          documents: string[] | null
          experience_years: number | null
          farm_address: string | null
          farm_name: string | null
          id: string
          license_image_url: string | null
          license_number: string | null
          office_name: string | null
          phone: string | null
          portfolio_urls: string[] | null
          reject_reason: string | null
          representative_name: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_type: string | null
          status: string | null
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          business_license_url?: string | null
          business_number?: string | null
          business_type?: string | null
          certification_type?: string | null
          certification_url?: string | null
          certifications?: string[] | null
          company_name?: string | null
          created_at?: string | null
          data?: Json | null
          documents?: string[] | null
          experience_years?: number | null
          farm_address?: string | null
          farm_name?: string | null
          id?: string
          license_image_url?: string | null
          license_number?: string | null
          office_name?: string | null
          phone?: string | null
          portfolio_urls?: string[] | null
          reject_reason?: string | null
          representative_name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          business_license_url?: string | null
          business_number?: string | null
          business_type?: string | null
          certification_type?: string | null
          certification_url?: string | null
          certifications?: string[] | null
          company_name?: string | null
          created_at?: string | null
          data?: Json | null
          documents?: string[] | null
          experience_years?: number | null
          farm_address?: string | null
          farm_name?: string | null
          id?: string
          license_image_url?: string | null
          license_number?: string | null
          office_name?: string | null
          phone?: string | null
          portfolio_urls?: string[] | null
          reject_reason?: string | null
          representative_name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_logs: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          id: string
          ip_address: string | null
          ip_hash: string | null
          os: string | null
          page_url: string | null
          path: string | null
          plaza_id: string | null
          referer: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          visited_at: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          ip_hash?: string | null
          os?: string | null
          page_url?: string | null
          path?: string | null
          plaza_id?: string | null
          referer?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          visited_at?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          ip_hash?: string | null
          os?: string | null
          page_url?: string | null
          path?: string | null
          plaza_id?: string | null
          referer?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "visitor_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_logs_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "visitor_logs_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      group_buying_host_stats: {
        Row: {
          cancel_count: number | null
          success_count: number | null
          success_pct: number | null
          total_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_buying_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_buying_posts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      my_club_chat_rooms: {
        Row: {
          club_id: string | null
          current_members: number | null
          images: string[] | null
          joined_at: string | null
          last_message: string | null
          last_message_at: string | null
          last_read_at: string | null
          max_members: number | null
          sport_type: string | null
          status: string | null
          title: string | null
          unread_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "club_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      my_group_buying_chat_rooms: {
        Row: {
          buyer_plaza_id: string | null
          current_participants: number | null
          group_price: number | null
          images: string[] | null
          last_message: string | null
          last_message_at: string | null
          last_read_at: string | null
          max_participants: number | null
          owner_id: string | null
          payment_status: string | null
          plaza_id: string | null
          post_id: string | null
          product_name: string | null
          quantity: number | null
          status: string | null
          title: string | null
          unread_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_group_buying_participants_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_group_buying_participants_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buying_participants_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_buying_participants_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_buying_posts_user_id_profiles_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profile_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_buying_posts_user_id_profiles_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_stats: {
        Row: {
          followers_count: number | null
          following_count: number | null
          user_id: string | null
        }
        Insert: {
          followers_count?: never
          following_count?: never
          user_id?: string | null
        }
        Update: {
          followers_count?: never
          following_count?: never
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _create_index_if_cols: {
        Args: { p_cols: string; p_index_name: string; p_table_name: string }
        Returns: undefined
      }
      apply_high_volume_flags: {
        Args: { days_back?: number; threshold?: number }
        Returns: number
      }
      auto_complete_orders: {
        Args: never
        Returns: {
          domain: string
          order_id: string
          reason: string
        }[]
      }
      board_stats_aggregate: {
        Args: { p_days?: number; p_plaza_id?: string; p_region?: string }
        Returns: {
          avatar_url: string
          comments: number
          likes_received: number
          nickname: string
          posts: number
          user_id: string
        }[]
      }
      bump_atomic: {
        Args: {
          p_payment: string
          p_plaza_id: string
          p_points_cost?: number
          p_target_id: string
          p_target_type: string
          p_user_id: string
        }
        Returns: Json
      }
      bump_inc_daily: {
        Args: {
          p_col: string
          p_date: string
          p_plaza_id: string
          p_target_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      bump_purchase_ticket_atomic: {
        Args: {
          p_pack_id: string
          p_payment: string
          p_payment_id?: string
          p_plaza_id: string
          p_user_id: string
        }
        Returns: Json
      }
      change_like_count: {
        Args: {
          p_column?: string
          p_delta?: number
          p_id: string
          p_table: string
        }
        Returns: undefined
      }
      chat_unread_counts: {
        Args: { p_room_ids: string[]; p_user_id: string }
        Returns: {
          chat_room_id: string
          cnt: number
        }[]
      }
      club_join_atomic: {
        Args: { p_club_id: string; p_user_id: string }
        Returns: Json
      }
      count_user_posts_today: {
        Args: { p_table: string; p_user_id: string }
        Returns: number
      }
      current_plaza: { Args: never; Returns: string }
      deduct_video_credits: {
        Args: { p_points: number; p_user_id: string }
        Returns: number
      }
      detect_high_volume_users: {
        Args: { days_back?: number; threshold?: number }
        Returns: {
          post_count: number
          user_id: string
        }[]
      }
      gb_join_atomic: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: Json
      }
      gb_join_atomic_v2: {
        Args: {
          p_post_id: string
          p_quantity: number
          p_receive_method: string
          p_recipient_address: string
          p_recipient_address_detail: string
          p_recipient_name: string
          p_recipient_phone: string
          p_user_id: string
        }
        Returns: Json
      }
      get_email_by_username: {
        Args: { input_username: string }
        Returns: string
      }
      get_property_favorite_counts: {
        Args: { p_plaza_id: string; p_property_ids: string[] }
        Returns: {
          favorite_count: number
          property_id: string
        }[]
      }
      grant_points_atomic: {
        Args: { p_amount: number; p_plaza: string; p_user: string }
        Returns: undefined
      }
      grant_video_credits: {
        Args: { p_points: number; p_user_id: string }
        Returns: number
      }
      group_buying_auto_process: {
        Args: never
        Returns: {
          action: string
          paid_count: number
          processed_post_id: string
        }[]
      }
      increment_point_daily_counter: {
        Args: { p_date?: string; p_rule_id: string; p_user_id: string }
        Returns: number
      }
      increment_view_count: {
        Args: { p_column?: string; p_id: string; p_table: string }
        Returns: undefined
      }
      is_admin_for_plaza: { Args: { p_plaza_id: string }; Returns: boolean }
      is_app_admin: { Args: { p_uid: string }; Returns: boolean }
      is_plaza_admin:
        | { Args: { p_plaza: string; p_uid: string }; Returns: boolean }
        | { Args: { plaza: string }; Returns: boolean }
      is_plaza_admin_for: { Args: { check_plaza_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_super_plaza_admin: { Args: never; Returns: boolean }
      is_user_banned: {
        Args: { p_plaza: string; p_uid: string }
        Returns: boolean
      }
      log_search_query: { Args: { p_term: string }; Returns: undefined }
      points_confirm_one: { Args: { p_tx_id: string }; Returns: Json }
      points_refund_spend: {
        Args: { p_reason: string; p_tx_id: string }
        Returns: Json
      }
      points_revert_one: {
        Args: { p_reason: string; p_tx_id: string }
        Returns: Json
      }
      points_spend_atomic: {
        Args: {
          p_amount: number
          p_category: string
          p_payment_total?: number
          p_plaza_id: string
          p_source_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      set_current_plaza: { Args: { plaza: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      suggest_search_terms: {
        Args: { p_limit?: number; p_term: string }
        Returns: {
          count: number
          similarity: number
          term: string
        }[]
      }
      update_neighbor_star: { Args: { p_user_id: string }; Returns: undefined }
      update_plaza_business_info: {
        Args: { p_info: Json; p_plaza_id: string }
        Returns: Json
      }
      update_trust_score: { Args: { p_user_id: string }; Returns: undefined }
      user_in_plaza: { Args: { p_plaza_id: string }; Returns: boolean }
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
