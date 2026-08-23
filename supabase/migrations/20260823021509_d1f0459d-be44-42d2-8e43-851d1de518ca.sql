DROP POLICY IF EXISTS projects_select_access ON public.projects;
CREATE POLICY projects_select_access ON public.projects
FOR SELECT TO authenticated
USING (
  organizer_id = auth.uid()
  OR (group_id IS NOT NULL AND private.can_access_group(group_id))
  OR EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.project_id = projects.id AND pa.profile_id = auth.uid()
  )
);
DROP POLICY IF EXISTS projects_update_access ON public.projects;
CREATE POLICY projects_update_access ON public.projects
FOR UPDATE TO authenticated
USING (
  organizer_id = auth.uid()
  OR (group_id IS NOT NULL AND private.can_access_group(group_id))
  OR EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.project_id = projects.id AND pa.profile_id = auth.uid()
  )
)
WITH CHECK (
  organizer_id = auth.uid()
  OR (group_id IS NOT NULL AND private.can_access_group(group_id))
  OR EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.project_id = projects.id AND pa.profile_id = auth.uid()
  )
);
DROP FUNCTION IF EXISTS public.whoami();
DROP FUNCTION IF EXISTS public.whoami2();