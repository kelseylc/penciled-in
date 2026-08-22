CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.can_access_group(uuid) SET SCHEMA private;
ALTER FUNCTION public.can_access_project(uuid) SET SCHEMA private;

ALTER FUNCTION private.can_access_group(uuid) SET search_path = public;
ALTER FUNCTION private.can_access_project(uuid) SET search_path = public;

REVOKE ALL ON FUNCTION private.can_access_group(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_group(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_project(uuid) TO authenticated, service_role;