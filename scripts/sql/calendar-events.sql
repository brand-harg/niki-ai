create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  event_time time not null,
  course text,
  created_at timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

drop policy if exists "calendar events select own rows" on public.calendar_events;
create policy "calendar events select own rows"
on public.calendar_events
for select
using (auth.uid() = user_id);

drop policy if exists "calendar events insert own rows" on public.calendar_events;
create policy "calendar events insert own rows"
on public.calendar_events
for insert
with check (auth.uid() = user_id);

drop policy if exists "calendar events update own rows" on public.calendar_events;
create policy "calendar events update own rows"
on public.calendar_events
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "calendar events delete own rows" on public.calendar_events;
create policy "calendar events delete own rows"
on public.calendar_events
for delete
using (auth.uid() = user_id);

create index if not exists calendar_events_user_date_time_idx
on public.calendar_events (user_id, event_date, event_time);
