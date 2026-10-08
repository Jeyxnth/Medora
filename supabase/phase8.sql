-- Phase 8: follow-up tasks drafted from the approved Plan. Run in the Supabase SQL editor.
-- ROLLBACK: drop table if exists tasks;

create table tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  note_id uuid references clinical_notes on delete set null, -- source note
  title text not null,
  kind text not null check (kind in ('test', 'medication', 'follow_up', 'advice')),
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'open', 'done', 'dismissed')),
  source_refs jsonb not null default '[]', -- transcript line numbers from the Plan statement
  created_at timestamptz default now(),
  confirmed_by uuid, confirmed_at timestamptz,
  completed_by uuid, completed_at timestamptz
);

-- Approving the same note twice must not create duplicates.
create unique index tasks_note_title_key on tasks (note_id, title);

alter table tasks enable row level security;
create policy "authenticated full access" on tasks for all to authenticated using (true) with check (true);
