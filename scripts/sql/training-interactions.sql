create table if not exists public.training_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  prompt text,
  response text,
  user_prompt text not null,
  assistant_response text not null,
  mode text not null check (mode in ('pure', 'nemanja')),
  teaching_mode boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.training_interactions
add column if not exists prompt text;

alter table public.training_interactions
add column if not exists response text;

comment on table public.training_interactions is
  'Separate consent-gated quality/training log. This is not the normal chats/messages history table.';

alter table public.training_interactions enable row level security;

create index if not exists training_interactions_created_idx
on public.training_interactions (created_at desc);

create index if not exists training_interactions_user_created_idx
on public.training_interactions (user_id, created_at desc);
