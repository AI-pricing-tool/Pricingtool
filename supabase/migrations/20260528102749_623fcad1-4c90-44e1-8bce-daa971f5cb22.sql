create or replace function public.create_organisation_for_current_user(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_slug text;
  v_org_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  v_slug := regexp_replace(lower(coalesce(nullif(p_name, ''), 'workspace')), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  v_slug := coalesce(nullif(v_slug, ''), 'workspace') || '-' || substr(v_user::text, 1, 6);

  insert into public.organisations (name, slug)
  values (coalesce(nullif(p_name, ''), 'My workspace'), v_slug)
  returning id into v_org_id;

  update public.profiles
    set organisation_id = v_org_id
    where id = v_user and organisation_id is null;

  return v_org_id;
end;
$$;

grant execute on function public.create_organisation_for_current_user(text) to authenticated;