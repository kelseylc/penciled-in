ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'plans',
  ADD COLUMN IF NOT EXISTS campaign_name text,
  ADD COLUMN IF NOT EXISTS table_rule text,
  ADD COLUMN IF NOT EXISTS auto_lock_rescue boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS session_counter integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS venue text,
  ADD COLUMN IF NOT EXISTS vtt_link text;

ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_mode_chk;
ALTER TABLE public.groups ADD CONSTRAINT groups_mode_chk CHECK (mode IN ('campaign','plans'));
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_table_rule_chk;
ALTER TABLE public.groups ADD CONSTRAINT groups_table_rule_chk
  CHECK (table_rule IS NULL OR table_rule IN ('play_anyway','strict_quorum','everyone'));

ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player';
ALTER TABLE public.group_members DROP CONSTRAINT IF EXISTS group_members_role_chk;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_role_chk CHECK (role IN ('dm','player','guest'));

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS last_seen_change_at timestamptz;
ALTER TABLE public.participants DROP CONSTRAINT IF EXISTS participants_role_chk;
ALTER TABLE public.participants ADD CONSTRAINT participants_role_chk CHECK (role IN ('dm','player','guest'));

ALTER TABLE public.occurrences
  ADD COLUMN IF NOT EXISTS session_number integer,
  ADD COLUMN IF NOT EXISTS rescue_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS played_at timestamptz,
  ADD COLUMN IF NOT EXISTS moved_at timestamptz;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_rescue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS app_mode text NOT NULL DEFAULT 'plans';
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_app_mode_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_app_mode_chk CHECK (app_mode IN ('campaign','plans'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_mode text NOT NULL DEFAULT 'plans';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_preferred_mode_chk;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_preferred_mode_chk CHECK (preferred_mode IN ('campaign','plans'));

CREATE INDEX IF NOT EXISTS occurrences_rescue_project_idx ON public.occurrences(rescue_project_id);
CREATE INDEX IF NOT EXISTS projects_is_rescue_idx ON public.projects(is_rescue);