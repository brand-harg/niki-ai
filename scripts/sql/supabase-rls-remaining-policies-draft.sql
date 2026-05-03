-- NIKIAI Supabase RLS performance remediation draft: remaining live policies.
-- REVIEW AND APPLY IN STAGING FIRST. DO NOT RUN DIRECTLY AGAINST PRODUCTION.
--
-- Scope:
-- - Address the latest Supabase auth_rls_initplan warnings for the live policy
--   names listed below by replacing direct auth.uid()/auth.role() calls with
--   (select auth.uid()) / (select auth.role()).
-- - Preserve existing ownership and service-role behavior.
--
-- Important:
-- - This draft only references policies from the latest Supabase linter output.
-- - Before staging, compare each ALTER POLICY predicate with the live policy
--   definition in Supabase. Do not apply a section if the live policy uses a
--   different predicate than the one documented here.
-- - usage_interactions multiple SELECT policy consolidation is intentionally
--   manual-only until the two live policy definitions are compared.
-- - No app code, schema, vector extension, broad access, or unused indexes are
--   changed here.

begin;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
-- Preserve behavior:
-- - users can view only their own profile
-- - users can insert only their own profile
-- - users can update only their own profile
--
-- Expected live predicate shape: id = auth.uid()

alter policy "Users can view own profile"
on public.profiles
using (id = (select auth.uid()));

alter policy "Users can insert own profile"
on public.profiles
with check (id = (select auth.uid()));

alter policy "Users can update own profile"
on public.profiles
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. security_logs
-- ---------------------------------------------------------------------------
-- Preserve behavior:
-- - users can view only their own security logs
-- - users can insert only their own security logs
--
-- Expected live predicate shape: user_id = auth.uid()

alter policy "Users can view own security logs"
on public.security_logs
using (user_id = (select auth.uid()));

alter policy "Users can insert own security logs"
on public.security_logs
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. usage_interactions
-- ---------------------------------------------------------------------------
-- Preserve behavior:
-- - users can view only their own usage metadata logs
-- - logs remain metadata-only and consent-gated by app/server logic
--
-- Expected live predicate shape for both current SELECT policies:
-- user_id = auth.uid()
--
-- This fixes auth_rls_initplan for both policies but intentionally does not
-- consolidate them. See the manual section below before addressing the
-- multiple_permissive_policies warning.

alter policy "Users can view their own logs"
on public.usage_interactions
using (user_id = (select auth.uid()));

alter policy "Users can view their own usage logs"
on public.usage_interactions
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. chats
-- ---------------------------------------------------------------------------
-- Preserve behavior:
-- - users can view/create/update/delete only their own chats
--
-- Expected live predicate shape: user_id = auth.uid()

alter policy "Users can view own chats"
on public.chats
using (user_id = (select auth.uid()));

alter policy "Users can insert own chats"
on public.chats
with check (user_id = (select auth.uid()));

alter policy "Users can update own chats"
on public.chats
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy "Users can delete own chats"
on public.chats
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. messages
-- ---------------------------------------------------------------------------
-- Preserve behavior:
-- - users can view/create/update/delete messages only inside chats they own
--
-- App code writes messages with chat_id, not user_id, so the expected live
-- predicate shape is chat ownership through public.chats. If the live messages
-- table has a user_id-scoped policy instead, do not apply this section; convert
-- that exact live predicate to use (select auth.uid()) instead.

alter policy "Users can view own messages"
on public.messages
using (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = (select auth.uid())
  )
);

alter policy "Users can insert own messages"
on public.messages
with check (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = (select auth.uid())
  )
);

alter policy "Users can update own messages"
on public.messages
using (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = (select auth.uid())
  )
);

alter policy "Users can delete own messages"
on public.messages
using (
  exists (
    select 1
    from public.chats c
    where c.id = chat_id
      and c.user_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- 6. training_interactions
-- ---------------------------------------------------------------------------
-- Preserve behavior:
-- - insert remains service-role only
-- - select remains owner-only
-- - consent/training gating remains app/server-owned
--
-- Expected live predicate shape:
-- - insert: auth.role() = 'service_role'
-- - select: user_id = auth.uid()

alter policy "training interactions insert service role only"
on public.training_interactions
with check ((select auth.role()) = 'service_role');

alter policy "training interactions select own rows"
on public.training_interactions
using (user_id = (select auth.uid()));

commit;

-- ---------------------------------------------------------------------------
-- Manual-only: usage_interactions SELECT policy consolidation.
-- ---------------------------------------------------------------------------
-- Remaining warning:
-- - multiple_permissive_policies for authenticated SELECT on usage_interactions
-- - current policies listed by Supabase:
--   - "Users can view their own logs"
--   - "Users can view their own usage logs"
--
-- Do not run the consolidation below until both live policy definitions are
-- confirmed logically identical. If both are exactly user_id = auth.uid(), the
-- staging-only consolidation can be:
--
-- begin;
--
-- drop policy if exists "Users can view their own logs"
-- on public.usage_interactions;
--
-- drop policy if exists "Users can view their own usage logs"
-- on public.usage_interactions;
--
-- create policy "Users can view their own usage logs"
-- on public.usage_interactions
-- for select
-- to authenticated
-- using (user_id = (select auth.uid()));
--
-- commit;
--
-- If either policy includes extra consent, admin, retention, or metadata
-- conditions, preserve those exact conditions and do not use this simplified
-- consolidation.

-- ---------------------------------------------------------------------------
-- Warnings addressed by this draft.
-- ---------------------------------------------------------------------------
-- auth_rls_initplan:
-- - profiles:
--   - Users can view own profile
--   - Users can insert own profile
--   - Users can update own profile
-- - security_logs:
--   - Users can view own security logs
--   - Users can insert own security logs
-- - usage_interactions:
--   - Users can view their own logs
--   - Users can view their own usage logs
-- - chats:
--   - Users can view own chats
--   - Users can insert own chats
--   - Users can update own chats
--   - Users can delete own chats
-- - messages:
--   - Users can view own messages
--   - Users can insert own messages
--   - Users can update own messages
--   - Users can delete own messages
-- - training_interactions:
--   - training interactions insert service role only
--   - training interactions select own rows

-- ---------------------------------------------------------------------------
-- Warnings intentionally left manual.
-- ---------------------------------------------------------------------------
-- multiple_permissive_policies:
-- - usage_interactions SELECT policy consolidation remains manual until the
--   two live policy definitions are confirmed logically identical.

-- ---------------------------------------------------------------------------
-- Staging verification checklist.
-- ---------------------------------------------------------------------------
-- 1. Rerun Supabase Performance Advisor after applying in staging.
-- 2. Confirm all listed auth_rls_initplan warnings are resolved.
-- 3. Confirm the usage_interactions multiple_permissive_policies warning still
--    exists unless you also performed the manual consolidation.
-- 4. User can view, insert, and update only their own profile.
-- 5. User can view, create, update, and delete only their own chats.
-- 6. User can view, create, update, and delete messages only in chats they own.
-- 7. User cannot read or write another user's chats or messages.
-- 8. Security logs remain user-scoped.
-- 9. Usage logs remain user-scoped and metadata-only.
-- 10. Training logs remain service/consent-gated and user-scoped.
-- 11. No anonymous or cross-user reads/writes are introduced.
-- 12. Run NIKIAI gates before production:
--     npm run audit:beta
--     npm run test:e2e
