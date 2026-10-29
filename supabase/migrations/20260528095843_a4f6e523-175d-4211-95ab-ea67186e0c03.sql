
create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

revoke execute on function public.current_org_id() from public, anon;
grant execute on function public.current_org_id() to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
