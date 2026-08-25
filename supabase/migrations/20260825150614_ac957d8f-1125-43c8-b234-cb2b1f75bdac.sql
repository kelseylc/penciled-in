ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE public.occurrences ADD COLUMN IF NOT EXISTS announced_at timestamptz;
ALTER TABLE public.default_availability ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;