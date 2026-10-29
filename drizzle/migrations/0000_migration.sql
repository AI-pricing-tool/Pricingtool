do $$ declare t text; p text; begin
for t,p in select * from (values ('buy_rates','br read'),('canonical_categories','cat read'),('fee_categories','fee read'),('mapping_dictionary','dict read'),('semantic_tokens','tok read')) v(t,p) loop
  execute format('drop policy if exists %I on public.%I', p, t);
  execute format('create policy %I on public.%I for select to authenticated using (public.has_role(auth.uid(),''super_admin'') or public.has_role(auth.uid(),''reseller'') or public.has_role(auth.uid(),''viewer''))', p, t);
end loop; end $$;