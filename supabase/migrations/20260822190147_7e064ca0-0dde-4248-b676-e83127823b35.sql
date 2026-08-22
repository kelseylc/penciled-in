CREATE OR REPLACE FUNCTION private.can_access_project(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = _project_id
      AND (
        p.organizer_id = auth.uid()
        OR (p.group_id IS NOT NULL AND private.can_access_group(p.group_id))
      )
  ) OR EXISTS (
    SELECT 1 FROM public.participants pa
    WHERE pa.project_id = _project_id AND pa.profile_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION private.can_access_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_project(uuid) TO authenticated, service_role;