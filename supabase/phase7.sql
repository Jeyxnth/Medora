-- Phase 7: append-only audit_log. Run in the Supabase SQL editor.
-- Only audit_log policies change; other tables are untouched.

drop policy if exists "authenticated full access" on audit_log;

-- Any signed-in user may append a row, but only as themselves.
create policy "audit insert own rows" on audit_log
  for insert to authenticated
  with check (user_id = auth.uid());

-- Only doctors may read the log.
create policy "audit select doctors" on audit_log
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'doctor'));

-- No UPDATE or DELETE policy: with RLS enabled, that means nobody can change or remove rows.

-- ROLLBACK (restores the original full-access policy):
-- drop policy if exists "audit insert own rows" on audit_log;
-- drop policy if exists "audit select doctors" on audit_log;
-- create policy "authenticated full access" on audit_log
--   for all to authenticated using (true) with check (true);
