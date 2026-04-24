-- RAG foundation schema for lecture retrieval.
-- Run this in Supabase SQL editor (or your migration workflow).

create extension if not exists vector;

create table if not exists public.lecture_sources (
  id uuid primary key default gen_random_uuid(),
  course text not null,
  lecture_title text not null,
  video_url text not null,
  professor text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.lecture_sources enable row level security;

drop policy if exists "lecture sources are publicly readable" on public.lecture_sources;
create policy "lecture sources are publicly readable"
on public.lecture_sources
for select
using (true);

create table if not exists public.lecture_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.lecture_sources(id) on delete cascade,
  chunk_index int not null,
  raw_text text not null,
  clean_text text not null,
  section_hint text,
  timestamp_start_seconds int not null check (timestamp_start_seconds >= 0),
  timestamp_end_seconds int not null check (timestamp_end_seconds >= timestamp_start_seconds),
  token_count int,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create table if not exists public.persona_snippets (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.lecture_sources(id) on delete cascade,
  snippet_text text not null,
  persona_tag text default 'teaching_style',
  timestamp_start_seconds int not null check (timestamp_start_seconds >= 0),
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.lecture_sources(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'failed', 'completed')),
  error text,
  cleaning_model text,
  embedding_model text,
  created_at timestamptz not null default now()
);

create index if not exists lecture_chunks_source_time_idx
  on public.lecture_chunks (source_id, timestamp_start_seconds);

create index if not exists persona_snippets_source_time_idx
  on public.persona_snippets (source_id, timestamp_start_seconds);

create index if not exists lecture_chunks_embedding_idx
  on public.lecture_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists persona_snippets_embedding_idx
  on public.persona_snippets using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RPC: retrieve top lecture chunks by cosine similarity.
create or replace function public.match_lecture_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  filter_course text default null,
  filter_professor text default null,
  filter_source_id uuid default null
)
returns table (
  id uuid,
  source_id uuid,
  clean_text text,
  timestamp_start_seconds int,
  timestamp_end_seconds int,
  section_hint text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.source_id,
    c.clean_text,
    c.timestamp_start_seconds,
    c.timestamp_end_seconds,
    c.section_hint,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.lecture_chunks c
  join public.lecture_sources s on s.id = c.source_id
  where c.embedding is not null
    and (filter_source_id is null or c.source_id = filter_source_id)
    and (filter_course is null or s.course ilike '%' || filter_course || '%')
    and (filter_professor is null or s.professor ilike '%' || filter_professor || '%')
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- RPC: retrieve style snippets.
create or replace function public.match_persona_snippets(
  query_embedding vector(1536),
  match_count int default 3,
  filter_course text default null,
  filter_professor text default null,
  filter_source_id uuid default null
)
returns table (
  id uuid,
  source_id uuid,
  snippet_text text,
  persona_tag text,
  timestamp_start_seconds int,
  similarity float
)
language sql stable
as $$
  select
    p.id,
    p.source_id,
    p.snippet_text,
    p.persona_tag,
    p.timestamp_start_seconds,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.persona_snippets p
  join public.lecture_sources s on s.id = p.source_id
  where p.embedding is not null
    and (filter_source_id is null or p.source_id = filter_source_id)
    and (filter_course is null or s.course ilike '%' || filter_course || '%')
    and (filter_professor is null or s.professor ilike '%' || filter_professor || '%')
  order by p.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
