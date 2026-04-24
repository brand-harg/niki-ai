create table if not exists public.study_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  source_prompt text,
  kind text,
  course_tag text,
  topic_tag text,
  is_public boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_artifacts
add column if not exists is_public boolean;

alter table public.study_artifacts
alter column is_public set default false;

alter table public.study_artifacts enable row level security;

drop policy if exists "study artifacts select own rows" on public.study_artifacts;
create policy "study artifacts select own rows"
on public.study_artifacts
for select
using (auth.uid() = user_id);

drop policy if exists "study artifacts select public rows" on public.study_artifacts;
create policy "study artifacts select public rows"
on public.study_artifacts
for select
using (is_public = true);

drop policy if exists "study artifacts insert own rows" on public.study_artifacts;
create policy "study artifacts insert own rows"
on public.study_artifacts
for insert
with check (auth.uid() = user_id);

drop policy if exists "study artifacts update own rows" on public.study_artifacts;
create policy "study artifacts update own rows"
on public.study_artifacts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "study artifacts delete own rows" on public.study_artifacts;
create policy "study artifacts delete own rows"
on public.study_artifacts
for delete
using (auth.uid() = user_id);

create index if not exists study_artifacts_user_updated_idx
on public.study_artifacts (user_id, updated_at desc, created_at desc);
