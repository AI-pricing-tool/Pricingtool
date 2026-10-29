create or replace function public.admin_set_user_org_and_role(
  p_user_id uuid,
  p_org_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_old_org uuid;
  v_old_roles text;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_role(v_caller, 'super_admin') then
    raise exception 'forbidden';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  select organisation_id into v_old_org from public.profiles where id = p_user_id;
  select string_agg(role::text, ',') into v_old_roles from public.user_roles where user_id = p_user_id;

  update public.profiles set organisation_id = p_org_id, updated_at = now() where id = p_user_id;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role) values (p_user_id, p_role);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, payload, organisation_id)
  values (
    v_caller,
    'admin.set_user_org_and_role',
    'user',
    p_user_id,
    jsonb_build_object(
      'old_org', v_old_org,
      'new_org', p_org_id,
      'old_roles', v_old_roles,
      'new_role', p_role::text
    ),
    p_org_id
  );
end;
$$;

grant execute on function public.admin_set_user_org_and_role(uuid, uuid, public.app_role) to authenticated;