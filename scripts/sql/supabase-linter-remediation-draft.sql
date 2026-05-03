-- NIKIAI Supabase RLS performance remediation draft.
-- REVIEW AND APPLY IN STAGING FIRST. DO NOT RUN DIRECTLY AGAINST PRODUCTION.
--
-- Scope:
-- - Fix repo-known auth_rls_initplan warnings by replacing direct auth.uid()
--   calls in RLS policies with (select auth.uid()).
-- - Consolidate the repo-known study_artifacts SELECT policies while preserving
--   the existing public/private behavior.
--
-- Explicitly not included in this draft:
-- - No app/frontend behavior changes.
-- - No dashboard-only policy rewrites for tables whose policies are not
--   represented in repo SQL.
-- - No vector extension changes.
-- - No function/search_path changes.
-- - No FK index changes.
-- - No unused-index removal.

begin;

-- ---------------------------------------------------------------------------
-- 1. study_artifacts SELECT policy consolidation.
-- ---------------------------------------------------------------------------
-- Previous behavior from repo SQL:
-- - "study artifacts select public rows": anyone may read rows where
--   is_public = true.
-- - "study artifacts select own rows": authenticated users may read rows where
--   auth.uid() = user_id.
--
-- New behavior is logically equivalent, but uses one permissive SELECT policy
-- to address the multiple_permissive_policies warning and wraps auth.uid() in a
-- SELECT to address auth_rls_initplan.

drop policy if exists "study artifacts select own rows" on public.study_artifacts;
drop policy if exists "study artifacts select public rows" on public.study_artifacts;
drop policy if exists "study artifacts select visible rows" on public.study_artifacts;

create policy "study artifacts select visible rows"
on public.study_artifacts
for select
using (
  is_public = true
  or user_id = (select auth.uid())
);

-- ---------------------------------------------------------------------------
-- 2. study_artifacts owner policies.
-- ---------------------------------------------------------------------------
-- Keep INSERT/UPDATE/DELETE behavior identical: users can only create, update,
-- or delete their own artifacts. The only change is wrapping auth.uid() in
-- SELECT so the value is evaluated once per statement instead of once per row.

alter policy "study artifacts insert own rows"
on public.study_artifacts
with check (user_id = (select auth.uid()));

alter policy "study artifacts update own rows"
on public.study_artifacts
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy "study artifacts delete own rows"
on public.study_artifacts
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. calendar_events owner policies.
-- ---------------------------------------------------------------------------
-- Keep calendar behavior identical: users can only select, insert, update, or
-- delete their own events. The only change is the auth.uid() initplan
-- performance wrapper.

alter policy "calendar events select own rows"
on public.calendar_events
using (user_id = (select auth.uid()));

alter policy "calendar events insert own rows"
on public.calendar_events
with check (user_id = (select auth.uid()));

alter policy "calendar events update own rows"
on public.calendar_events
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy "calendar events delete own rows"
on public.calendar_events
using (user_id = (select auth.uid()));

commit;

-- ---------------------------------------------------------------------------
-- Dashboard/manual-only remediation notes.
-- ---------------------------------------------------------------------------
-- Supabase Performance Advisor also reported auth_rls_initplan warnings for
-- tables whose live policies are not represented in repo SQL, such as:
-- - profiles
-- - security_logs
-- - usage_interactions
-- - chats
-- - messages
-- - training_interactions
--
-- Do not guess these policy names or expressions in this draft. Inspect the
-- live policy SQL in Supabase first, then apply behavior-equivalent changes in
-- staging using the same pattern:
--
--   -- Example only after confirming the exact live policy name and logic:
--   -- alter policy "policy name"
--   -- on public.table_name
--   -- using (user_id = (select auth.uid()));
--
--   -- Example WITH CHECK conversion:
--   -- alter policy "policy name"
--   -- on public.table_name
--   -- with check (user_id = (select auth.uid()));
--
-- If a policy uses auth.role(), use the equivalent wrapper:
--
--   -- (select auth.role())
--
-- usage_interactions also had multiple/overlapping SELECT policy warnings in
-- Supabase. Consolidate those only after confirming the live policies are
-- logically identical and still keep metadata access consent/user-scoped.

-- ---------------------------------------------------------------------------
-- Staging verification checklist after applying this draft.
-- ---------------------------------------------------------------------------
-- 1. Rerun Supabase Performance Advisor and confirm the repo-known
--    study_artifacts/calendar_events auth_rls_initplan warnings are resolved.
-- 2. Confirm study_artifacts no longer reports multiple permissive SELECT
--    policies.
-- 3. User A can read, create, update, and delete User A private artifacts.
-- 4. User B cannot read, update, or delete User A private artifacts.
-- 5. Anonymous users and other authenticated users can read public artifacts
--    only when is_public = true.
-- 6. Private artifacts do not appear in public artifact flows.
-- 7. Calendar events remain owner-only for select/insert/update/delete.
-- 8. User can read own chats/messages and cannot read another user's
--    chats/messages after the dashboard-only policies are remediated.
-- 9. Training and usage logs remain consent-gated and user-scoped after their
--    dashboard-only policies are remediated.
-- 10. Run the NIKIAI beta gates and browser smoke checks before production:
--     npm run audit:beta
--     npm run test:e2e
