REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_group(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid) TO authenticated;