-- =========================
-- Tables
-- =========================

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  timezone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  timezone text,
  is_required_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.default_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_member_id uuid NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  weekly_pattern jsonb NOT NULL DEFAULT '{}'::jsonb,
  blackout_dates date[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  organizer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  template text NOT NULL DEFAULT 'hang'
    CHECK (template IN ('coffee','brunch','lunch','dinner','movie','dnd','hang')),
  duration_minutes int NOT NULL DEFAULT 120,
  mode text NOT NULL DEFAULT 'one_off' CHECK (mode IN ('one_off','recurring')),
  cadence text CHECK (cadence IN ('weekly','biweekly','monthly','quarterly')),
  window_mode text NOT NULL DEFAULT 'rolling' CHECK (window_mode IN ('rolling','custom')),
  window_start date NOT NULL DEFAULT CURRENT_DATE,
  window_end date NOT NULL DEFAULT (CURRENT_DATE + 21),
  quorum_min int NOT NULL DEFAULT 3,
  response_deadline timestamptz,
  status text NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting','locked','archived')),
  slug text UNIQUE NOT NULL,
  parent_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  repoll_for_occurrence_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  timezone text,
  is_required boolean NOT NULL DEFAULT false,
  token text UNIQUE NOT NULL DEFAULT (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  responded_at timestamptz
);

CREATE TABLE public.candidate_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  start_utc timestamptz NOT NULL,
  end_utc timestamptz NOT NULL
);

CREATE TABLE public.slot_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  candidate_slot_id uuid NOT NULL REFERENCES public.candidate_slots(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('yes','maybe','no')),
  UNIQUE (participant_id, candidate_slot_id)
);

CREATE TABLE public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  chosen_slot_id uuid REFERENCES public.candidate_slots(id) ON DELETE SET NULL,
  cadence_weekday int CHECK (cadence_weekday BETWEEN 0 AND 6),
  cadence_start_time_utc time,
  cadence_kind text CHECK (cadence_kind IN ('weekly','biweekly','monthly','quarterly')),
  locked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scheduled_start_utc timestamptz NOT NULL,
  scheduled_end_utc timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','at_risk','cancelled','repolling')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects
  ADD CONSTRAINT projects_repoll_for_occurrence_fkey
  FOREIGN KEY (repoll_for_occurrence_id) REFERENCES public.occurrences(id) ON DELETE SET NULL;

CREATE TABLE public.occurrence_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES public.occurrences(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('in','out','late')),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (occurrence_id, participant_id)
);

-- =========================
-- Indexes
-- =========================
CREATE INDEX idx_group_members_group ON public.group_members(group_id);
CREATE INDEX idx_group_members_profile ON public.group_members(profile_id);
CREATE INDEX idx_default_availability_member ON public.default_availability(group_member_id);
CREATE INDEX idx_projects_group ON public.projects(group_id);
CREATE INDEX idx_participants_project ON public.participants(project_id);
CREATE INDEX idx_candidate_slots_project ON public.candidate_slots(project_id);
CREATE INDEX idx_slot_responses_slot ON public.slot_responses(candidate_slot_id);
CREATE INDEX idx_slot_responses_participant ON public.slot_responses(participant_id);
CREATE INDEX idx_decisions_project ON public.decisions(project_id);
CREATE INDEX idx_occurrences_project ON public.occurrences(project_id);
CREATE INDEX idx_occurrence_rsvps_occurrence ON public.occurrence_rsvps(occurrence_id);

-- =========================
-- Grants (Data API)
-- =========================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.default_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slot_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.occurrences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.occurrence_rsvps TO authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.groups TO service_role;
GRANT ALL ON public.group_members TO service_role;
GRANT ALL ON public.default_availability TO service_role;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.participants TO service_role;
GRANT ALL ON public.candidate_slots TO service_role;
GRANT ALL ON public.slot_responses TO service_role;
GRANT ALL ON public.decisions TO service_role;
GRANT ALL ON public.occurrences TO service_role;
GRANT ALL ON public.occurrence_rsvps TO service_role;

-- =========================
-- Access helper functions (security definer, avoid RLS recursion)
-- =========================
CREATE OR REPLACE FUNCTION public.can_access_group(_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = _group_id AND g.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.group_members m
    WHERE m.group_id = _group_id AND m.profile_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id
      AND (
        p.organizer_id = auth.uid()
        OR (p.group_id IS NOT NULL AND public.can_access_group(p.group_id))
      )
  ) OR EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.project_id = _project_id AND pa.profile_id = auth.uid()
  );
$$;

-- =========================
-- RLS
-- =========================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occurrence_rsvps ENABLE ROW LEVEL SECURITY;

-- profiles: own row
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- groups
CREATE POLICY "groups_select_member" ON public.groups
  FOR SELECT TO authenticated USING (public.can_access_group(id));
CREATE POLICY "groups_insert_owner" ON public.groups
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "groups_update_owner" ON public.groups
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "groups_delete_owner" ON public.groups
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- group_members
CREATE POLICY "group_members_all_member" ON public.group_members
  FOR ALL TO authenticated
  USING (public.can_access_group(group_id))
  WITH CHECK (public.can_access_group(group_id));

-- default_availability
CREATE POLICY "default_availability_all_member" ON public.default_availability
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_members m WHERE m.id = group_member_id AND public.can_access_group(m.group_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.group_members m WHERE m.id = group_member_id AND public.can_access_group(m.group_id)));

-- projects
CREATE POLICY "projects_select_access" ON public.projects
  FOR SELECT TO authenticated USING (public.can_access_project(id));
CREATE POLICY "projects_insert_organizer" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (organizer_id = auth.uid() AND (group_id IS NULL OR public.can_access_group(group_id)));
CREATE POLICY "projects_update_access" ON public.projects
  FOR UPDATE TO authenticated USING (public.can_access_project(id)) WITH CHECK (public.can_access_project(id));
CREATE POLICY "projects_delete_organizer" ON public.projects
  FOR DELETE TO authenticated USING (organizer_id = auth.uid());

-- participants
CREATE POLICY "participants_all_access" ON public.participants
  FOR ALL TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

-- candidate_slots
CREATE POLICY "candidate_slots_all_access" ON public.candidate_slots
  FOR ALL TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

-- slot_responses
CREATE POLICY "slot_responses_all_access" ON public.slot_responses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.participants pa WHERE pa.id = participant_id AND public.can_access_project(pa.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.participants pa WHERE pa.id = participant_id AND public.can_access_project(pa.project_id)));

-- decisions
CREATE POLICY "decisions_all_access" ON public.decisions
  FOR ALL TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

-- occurrences
CREATE POLICY "occurrences_all_access" ON public.occurrences
  FOR ALL TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

-- occurrence_rsvps
CREATE POLICY "occurrence_rsvps_all_access" ON public.occurrence_rsvps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.occurrences o WHERE o.id = occurrence_id AND public.can_access_project(o.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.occurrences o WHERE o.id = occurrence_id AND public.can_access_project(o.project_id)));

-- =========================
-- Profile bootstrap on signup
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
