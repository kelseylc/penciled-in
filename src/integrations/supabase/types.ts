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
      candidate_slots: {
        Row: {
          end_utc: string
          id: string
          project_id: string
          start_utc: string
        }
        Insert: {
          end_utc: string
          id?: string
          project_id: string
          start_utc: string
        }
        Update: {
          end_utc?: string
          id?: string
          project_id?: string
          start_utc?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_slots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          cadence_kind: string | null
          cadence_start_time_utc: string | null
          cadence_weekday: number | null
          chosen_slot_id: string | null
          id: string
          locked_at: string
          project_id: string
        }
        Insert: {
          cadence_kind?: string | null
          cadence_start_time_utc?: string | null
          cadence_weekday?: number | null
          chosen_slot_id?: string | null
          id?: string
          locked_at?: string
          project_id: string
        }
        Update: {
          cadence_kind?: string | null
          cadence_start_time_utc?: string | null
          cadence_weekday?: number | null
          chosen_slot_id?: string | null
          id?: string
          locked_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_chosen_slot_id_fkey"
            columns: ["chosen_slot_id"]
            isOneToOne: false
            referencedRelation: "candidate_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      default_availability: {
        Row: {
          blackout_dates: string[]
          group_member_id: string
          id: string
          updated_at: string
          weekly_pattern: Json
        }
        Insert: {
          blackout_dates?: string[]
          group_member_id: string
          id?: string
          updated_at?: string
          weekly_pattern?: Json
        }
        Update: {
          blackout_dates?: string[]
          group_member_id?: string
          id?: string
          updated_at?: string
          weekly_pattern?: Json
        }
        Relationships: [
          {
            foreignKeyName: "default_availability_group_member_id_fkey"
            columns: ["group_member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          display_name: string
          group_id: string
          id: string
          is_required_default: boolean
          profile_id: string | null
          timezone: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          group_id: string
          id?: string
          is_required_default?: boolean
          profile_id?: string | null
          timezone?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          group_id?: string
          id?: string
          is_required_default?: boolean
          profile_id?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_rsvps: {
        Row: {
          id: string
          note: string | null
          occurrence_id: string
          participant_id: string
          state: string
          updated_at: string
        }
        Insert: {
          id?: string
          note?: string | null
          occurrence_id: string
          participant_id: string
          state: string
          updated_at?: string
        }
        Update: {
          id?: string
          note?: string | null
          occurrence_id?: string
          participant_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_rsvps_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_rsvps_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrences: {
        Row: {
          created_at: string
          id: string
          project_id: string
          scheduled_end_utc: string
          scheduled_start_utc: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          scheduled_end_utc: string
          scheduled_start_utc: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          scheduled_end_utc?: string
          scheduled_start_utc?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          display_name: string
          id: string
          is_required: boolean
          profile_id: string | null
          project_id: string
          responded_at: string | null
          timezone: string | null
          token: string
        }
        Insert: {
          display_name: string
          id?: string
          is_required?: boolean
          profile_id?: string | null
          project_id: string
          responded_at?: string | null
          timezone?: string | null
          token?: string
        }
        Update: {
          display_name?: string
          id?: string
          is_required?: boolean
          profile_id?: string | null
          project_id?: string
          responded_at?: string | null
          timezone?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          timezone: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          timezone?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          timezone?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          cadence: string | null
          created_at: string
          duration_minutes: number
          group_id: string | null
          id: string
          mode: string
          name: string
          organizer_id: string | null
          parent_project_id: string | null
          quorum_min: number
          repoll_for_occurrence_id: string | null
          response_deadline: string | null
          slug: string
          status: string
          template: string
          window_end: string
          window_mode: string
          window_start: string
        }
        Insert: {
          cadence?: string | null
          created_at?: string
          duration_minutes?: number
          group_id?: string | null
          id?: string
          mode?: string
          name: string
          organizer_id?: string | null
          parent_project_id?: string | null
          quorum_min?: number
          repoll_for_occurrence_id?: string | null
          response_deadline?: string | null
          slug: string
          status?: string
          template?: string
          window_end?: string
          window_mode?: string
          window_start?: string
        }
        Update: {
          cadence?: string | null
          created_at?: string
          duration_minutes?: number
          group_id?: string | null
          id?: string
          mode?: string
          name?: string
          organizer_id?: string | null
          parent_project_id?: string | null
          quorum_min?: number
          repoll_for_occurrence_id?: string | null
          response_deadline?: string | null
          slug?: string
          status?: string
          template?: string
          window_end?: string
          window_mode?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_repoll_for_occurrence_fkey"
            columns: ["repoll_for_occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_responses: {
        Row: {
          candidate_slot_id: string
          id: string
          participant_id: string
          state: string
        }
        Insert: {
          candidate_slot_id: string
          id?: string
          participant_id: string
          state: string
        }
        Update: {
          candidate_slot_id?: string
          id?: string
          participant_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_responses_candidate_slot_id_fkey"
            columns: ["candidate_slot_id"]
            isOneToOne: false
            referencedRelation: "candidate_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_responses_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_group: { Args: { _group_id: string }; Returns: boolean }
      can_access_project: { Args: { _project_id: string }; Returns: boolean }
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
