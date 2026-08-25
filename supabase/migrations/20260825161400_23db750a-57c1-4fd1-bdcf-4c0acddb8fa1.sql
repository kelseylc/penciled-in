DROP POLICY IF EXISTS groups_select_member ON public.groups;
CREATE POLICY groups_select_member ON public.groups
FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR private.can_access_group(id));