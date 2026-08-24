ALTER TABLE public.default_availability
  ALTER COLUMN group_member_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.default_availability
  ADD CONSTRAINT default_availability_owner_ck
  CHECK (num_nonnulls(group_member_id, profile_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS default_availability_profile_uidx
  ON public.default_availability (profile_id) WHERE profile_id IS NOT NULL;

DROP POLICY IF EXISTS default_availability_all_member ON public.default_availability;

CREATE POLICY default_availability_all_member ON public.default_availability
  FOR ALL TO authenticated
  USING (
    (group_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.group_members m
      WHERE m.id = default_availability.group_member_id AND private.can_access_group(m.group_id)
    ))
    OR profile_id = auth.uid()
  )
  WITH CHECK (
    (group_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.group_members m
      WHERE m.id = default_availability.group_member_id AND private.can_access_group(m.group_id)
    ))
    OR profile_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.default_availability TO authenticated;
GRANT ALL ON public.default_availability TO service_role;