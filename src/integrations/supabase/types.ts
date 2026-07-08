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
      friendships: {
        Row: {
          addressee_auth: string
          addressee_id: string
          created_at: string
          id: string
          requester_auth: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_auth: string
          addressee_id: string
          created_at?: string
          id?: string
          requester_auth: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_auth?: string
          addressee_id?: string
          created_at?: string
          id?: string
          requester_auth?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          auth_user_id: string | null
          forfeited: boolean
          match_id: string
          name: string
          pawns_eliminated: number
          player_id: string | null
          result: string
          rounds_won: number
          slot: number
          walls_placed: number
        }
        Insert: {
          auth_user_id?: string | null
          forfeited?: boolean
          match_id: string
          name: string
          pawns_eliminated?: number
          player_id?: string | null
          result: string
          rounds_won?: number
          slot: number
          walls_placed?: number
        }
        Update: {
          auth_user_id?: string | null
          forfeited?: boolean
          match_id?: string
          name?: string
          pawns_eliminated?: number
          player_id?: string | null
          result?: string
          rounds_won?: number
          slot?: number
          walls_placed?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          ended_at: string
          id: string
          mode: number
          ranked: boolean
          rounds: number
          winner_player_id: string | null
        }
        Insert: {
          ended_at?: string
          id?: string
          mode: number
          ranked?: boolean
          rounds: number
          winner_player_id?: string | null
        }
        Update: {
          ended_at?: string
          id?: string
          mode?: number
          ranked?: boolean
          rounds?: number
          winner_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_winner_player_id_fkey"
            columns: ["winner_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_events: {
        Row: {
          auth_user_id: string | null
          categories: string[]
          content: string | null
          created_at: string
          id: string
          match_id: string | null
          player_id: string
          severity: number
          surface: string
          verdict: string
        }
        Insert: {
          auth_user_id?: string | null
          categories?: string[]
          content?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          player_id: string
          severity?: number
          surface: string
          verdict: string
        }
        Update: {
          auth_user_id?: string | null
          categories?: string[]
          content?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          player_id?: string
          severity?: number
          surface?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_penalties: {
        Row: {
          active_until: string | null
          auth_user_id: string | null
          created_at: string
          id: string
          kind: string
          match_id: string | null
          player_id: string
          reason: string | null
        }
        Insert: {
          active_until?: string | null
          auth_user_id?: string | null
          created_at?: string
          id?: string
          kind: string
          match_id?: string | null
          player_id: string
          reason?: string | null
        }
        Update: {
          active_until?: string | null
          auth_user_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          match_id?: string | null
          player_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_penalties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      open_rooms: {
        Row: {
          auth_user_id: string | null
          code: string
          created_at: string
          host_name: string
          mode: number
          ranked: boolean
          seats_taken: number
          seats_total: number
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          code: string
          created_at?: string
          host_name: string
          mode: number
          ranked?: boolean
          seats_taken?: number
          seats_total: number
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          code?: string
          created_at?: string
          host_name?: string
          mode?: number
          ranked?: boolean
          seats_taken?: number
          seats_total?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_stats: {
        Row: {
          auth_user_id: string | null
          forfeits: number
          losses: number
          matches: number
          pawns_eliminated: number
          player_id: string
          ranked_losses: number
          ranked_matches: number
          ranked_wins: number
          rating: number
          updated_at: string
          walls_placed: number
          wins: number
        }
        Insert: {
          auth_user_id?: string | null
          forfeits?: number
          losses?: number
          matches?: number
          pawns_eliminated?: number
          player_id: string
          ranked_losses?: number
          ranked_matches?: number
          ranked_wins?: number
          rating?: number
          updated_at?: string
          walls_placed?: number
          wins?: number
        }
        Update: {
          auth_user_id?: string | null
          forfeits?: number
          losses?: number
          matches?: number
          pawns_eliminated?: number
          player_id?: string
          ranked_losses?: number
          ranked_matches?: number
          ranked_wins?: number
          rating?: number
          updated_at?: string
          walls_placed?: number
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          auth_user_id: string | null
          avatar_color: string | null
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          onboarded_at: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          id: string
          name: string
          onboarded_at?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          onboarded_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      puzzles: {
        Row: {
          active_player: number
          created_at: string
          goal_moves: number
          id: string
          mode: number
          pawns: Json
          puzzle_date: string
          title: string
          walls: Json
        }
        Insert: {
          active_player?: number
          created_at?: string
          goal_moves: number
          id?: string
          mode?: number
          pawns: Json
          puzzle_date: string
          title?: string
          walls?: Json
        }
        Update: {
          active_player?: number
          created_at?: string
          goal_moves?: number
          id?: string
          mode?: number
          pawns?: Json
          puzzle_date?: string
          title?: string
          walls?: Json
        }
        Relationships: []
      }
      saved_clips: {
        Row: {
          created_at: string
          id: string
          match_id: string | null
          mode: number
          owner_auth: string
          owner_player_id: string | null
          snapshot: Json
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id?: string | null
          mode: number
          owner_auth: string
          owner_player_id?: string | null
          snapshot: Json
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string | null
          mode?: number
          owner_auth?: string
          owner_player_id?: string | null
          snapshot?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_clips_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_clips_owner_player_id_fkey"
            columns: ["owner_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_elo_1v1: {
        Args: {
          _loser_name: string
          _loser_player_id: string
          _winner_name: string
          _winner_player_id: string
        }
        Returns: undefined
      }
      check_username_available: { Args: { _name: string }; Returns: boolean }
      complete_onboarding: {
        Args: { _country: string; _name: string; _player_id: string }
        Returns: undefined
      }
      my_active_chat_ban: {
        Args: never
        Returns: {
          active_until: string
          kind: string
          reason: string
        }[]
      }
      search_players: {
        Args: { _limit?: number; _q: string }
        Returns: {
          auth_user_id: string
          country: string
          name: string
          player_id: string
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
