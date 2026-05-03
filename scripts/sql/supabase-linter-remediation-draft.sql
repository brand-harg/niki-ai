-- NIKIAI Supabase linter remediation draft.
-- REVIEW IN STAGING FIRST. DO NOT RUN DIRECTLY AGAINST PRODUCTION.
--
-- Goals:
-- - Improve RLS policy performance by wrapping auth.uid() in SELECT where policy names are repo-known.
-- - Consolidate logically identical study_artifacts SELECT policies.
-- - Add safe FK helper indexes without removing existing indexes.
-- - Add explicit search_path to repo-known RAG functions.
-- - Keep dashboard-only function changes in manual-confirmation comments.
--
-- Not included:
-- - No vector extension move.
-- - No unused-index removal.
-- - No guessed policy rewrites for dashboard-only profiles/chats/messages/security_logs policies.
-- - No consolidation of unknown usage_interactions SELECT policies.
-- - No executable handle_new_user()/rls_auto_enable() changes without live function review.

begin;

-- ---------------------------------------------------------------------------
-- 1. RLS performance: repo-known study_artifacts policies.
-- ---------------------------------------------------------------------------

drop policy if exists "study artifacts select own rows" on public.study_artifacts;
drop policy if exists "study artifacts select public rows" on public.study_artifacts;

create policy "study artifacts select visible rows"
on public.study_artifacts
for select
using (
  is_public = true
  or (select auth.uid()) = user_id
);

alter policy "study artifacts insert own rows"
on public.study_artifacts
with check ((select auth.uid()) = user_id);

alter policy "study artifacts update own rows"
on public.study_artifacts
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter policy "study artifacts delete own rows"
on public.study_artifacts
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. RLS performance: repo-known calendar_events policies.
-- ---------------------------------------------------------------------------

alter policy "calendar events select own rows"
on public.calendar_events
using ((select auth.uid()) = user_id);

alter policy "calendar events insert own rows"
on public.calendar_events
with check ((select auth.uid()) = user_id);

alter policy "calendar events update own rows"
on public.calendar_events
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter policy "calendar events delete own rows"
on public.calendar_events
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Safe FK indexes. These do not remove or replace existing indexes.
-- ---------------------------------------------------------------------------

create index if not exists ingestion_jobs_source_id_idx
on public.ingestion_jobs (source_id);

create index if not exists lecture_sources_created_by_idx
on public.lecture_sources (created_by);

do $$
begin
  if to_regclass('public.security_logs') is not null then
    execute 'create index if not exists security_logs_user_id_idx on public.security_logs (user_id)';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Explicit search_path for repo-known RAG RPC functions.
-- Keep return shape and filtering behavior unchanged.
-- The repo installs vector without a schema, so use public here. Only switch to
-- `public, extensions` after confirming the live vector extension lives there.
-- ---------------------------------------------------------------------------

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
set search_path = public
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
set search_path = public
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

-- ---------------------------------------------------------------------------
-- 5. Dashboard-defined helper functions.
-- These are intentionally not changed in the executable path because their
-- bodies are not represented in repo SQL.
-- ---------------------------------------------------------------------------

-- Manual-confirmation-only changes:
-- Copy these into a separate staging migration only after confirming live
-- function bodies, dependencies, and Supabase linter output.
--
-- handle_updated_at search_path:
-- Inspect the live function body first, confirm whether it actually needs auth
-- in search_path, apply only in staging first, then retest update timestamp
-- behavior before production.
--
-- alter function public.handle_updated_at() set search_path = public, auth;
--
-- handle_new_user search_path:
-- Trigger behavior likely still works after hardening, but signup/profile
-- creation is beta-critical. Inspect the live function body and test signup,
-- email confirmation, OAuth, and profile creation in staging before applying.
--
-- alter function public.handle_new_user() set search_path = public, auth;
--
-- handle_new_user execute revoke:
-- Direct execute should usually be revoked from anon/authenticated, but test
-- trigger-driven signup/profile creation in staging first.
--
-- revoke execute on function public.handle_new_user() from anon, authenticated;
--
-- rls_auto_enable execute revoke:
-- Apply only after confirming no app/admin workflow depends on regular users
-- executing this helper.
--
-- revoke execute on function public.rls_auto_enable() from anon, authenticated;
--
-- usage_interactions FK index:
-- Repo SQL already defines usage_interactions_user_created_idx on
-- (user_id, created_at desc). Rerun Supabase linter in staging or confirm
-- whether that leading user_id composite index satisfies the FK warning before
-- adding this redundant single-column index.
--
-- create index if not exists usage_interactions_user_id_idx
-- on public.usage_interactions (user_id);

commit;

-- ---------------------------------------------------------------------------
-- Manual follow-up required:
-- ---------------------------------------------------------------------------
-- 1. Inspect dashboard-only policies for profiles, security_logs, chats, messages,
--    training_interactions, and usage_interactions.
-- 2. Replace direct auth.uid()/auth.role() calls with (select auth.uid()) /
--    (select auth.role()) only after confirming policy names and logic.
-- 3. Consolidate usage_interactions SELECT policies only if the combined policy
--    is logically identical and keeps metadata access safe.
-- 4. Confirm whether usage_interactions_user_created_idx satisfies the FK index
--    warning before adding usage_interactions_user_id_idx.
-- 5. Use `public, extensions` search_path for RAG RPCs only if the live vector
--    extension is confirmed to live in extensions.
-- 6. Rerun Supabase linter and the NIKIAI beta verification checklist.
