-- Phase 9: details on audit entries (what the doctor changed when confirming a handwritten prescription).
-- Run in the Supabase SQL editor. Adds one nullable column; policies are unchanged.
alter table audit_log add column if not exists details jsonb;

-- ROLLBACK:
-- alter table audit_log drop column if exists details;
