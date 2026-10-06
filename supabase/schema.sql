create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  role text not null check (role in ('doctor','nurse'))
);
create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null, dob date, sex text, mrn text, phone text
);
create table allergies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  substance text, reaction text
);
create table encounters (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  encounter_date date, type text, summary text
);
create table documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  doc_type text, file_path text,
  uploaded_at timestamptz default now(),
  status text not null default 'draft' check (status in ('draft','approved')),
  extracted_json jsonb
);
create table lab_results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  document_id uuid references documents on delete set null,
  test_name text, value numeric, unit text,
  ref_low numeric, ref_high numeric, flag text, collected_date date
);
create table medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  drug_name text, dose text, frequency text,
  start_date date, end_date date, prescribed_by text
);
create table clinical_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients on delete cascade,
  encounter_id uuid references encounters on delete set null,
  note_type text, content jsonb, transcript text,
  status text not null default 'draft' check (status in ('draft','approved')),
  approved_by uuid references profiles,
  created_at timestamptz default now()
);
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, action text, entity_type text, entity_id uuid, patient_id uuid,
  created_at timestamptz default now()
);

do $$
declare t text;
begin
  foreach t in array array['profiles','patients','allergies','encounters','documents',
    'lab_results','medications','clinical_notes','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "authenticated access to documents bucket" on storage.objects
  for all to authenticated
  using (bucket_id = 'documents') with check (bucket_id = 'documents');
