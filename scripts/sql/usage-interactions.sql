create table if not exists public.usage_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  mode text not null check (mode in ('pure', 'nemanja')),
  teaching_mode boolean not null default false,
  course text,
  requested_course text,
  active_course text,
  focus_course text,
  focus_topic text,
  created_at timestamptz not null default now()
);

comment on table public.usage_interactions is
  'Separate metadata-only usage log gated by share_usage_data. This is not the normal chats/messages history table.';

alter table public.usage_interactions enable row level security;

create index if not exists usage_interactions_created_idx
on public.usage_interactions (created_at desc);

create index if not exists usage_interactions_user_created_idx
on public.usage_interactions (user_id, created_at desc);
