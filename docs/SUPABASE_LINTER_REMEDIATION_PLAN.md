# NIKIAI Supabase Linter Remediation Plan

Use this plan to remediate the latest Supabase database linter warnings safely. Do not apply the migration directly to production. Review it in a Supabase preview/staging project first, then run the manual verification checklist before promoting anything.

> Safety: Do not paste secrets, private prompts, uploads, artifacts, tokens, cookies, API keys, service-role keys, private URLs, or full user data into audit notes. Do not run destructive SQL against production.

## Scope And Repo Findings

Local SQL files inspected:

- `scripts/sql/rag-foundation.sql`
- `scripts/sql/study-artifacts.sql`
- `scripts/sql/calendar-events.sql`
- `scripts/sql/training-interactions.sql`
- `scripts/sql/usage-interactions.sql`

Objects named by the linter but not defined in local SQL:

- `profiles`
- `security_logs`
- `chats`
- `messages`
- `handle_updated_at()`
- `handle_new_user()`
- `rls_auto_enable()`

Because those objects are not defined locally, changes to them should be verified in the Supabase dashboard or from a schema dump before production use.

## 1. Must Fix Before Beta

| Warning | What it means | Safest fix | SQL/migration needed | Risk | Verification | Review type |
| --- | --- | --- | --- | --- | --- | --- |
| `auth_rls_initplan` on user-owned RLS policies | Direct calls like `auth.uid()` can be evaluated per row and hurt performance. | Replace direct calls with `(select auth.uid())` or `(select auth.role())` inside policies. | Draft includes repo-known `study_artifacts` and `calendar_events` policy updates. Dashboard-only tables need policy-name review. | Low for logically identical policies; medium for dashboard-only objects because names are unknown locally. | User can still access own rows; cross-user access remains blocked. | Automated where policy names are known; manual for dashboard-only policies. |
| Multiple permissive `study_artifacts` SELECT policies | Separate own-row and public-row SELECT policies are both permissive, so Supabase warns they overlap. | Replace with one logically identical SELECT policy: public rows OR owner rows. | Draft consolidates the two repo-known policies into one policy. | Medium: must preserve public/private artifact behavior exactly. | Public artifacts readable; private artifacts owner-only. | Manual review plus browser/API smoke. |
| Multiple permissive `usage_interactions` SELECT policies | Duplicate/overlapping SELECT policies can be confusing and may broaden access accidentally. | Consolidate only after confirming the actual policy names and intended access. | Not safely drafted because repo SQL does not define usage SELECT policies. | Medium: usage logs are privacy-sensitive metadata. | Usage rows remain metadata-only and scoped as intended. | Manual. |
| Missing FK indexes on `ingestion_jobs.source_id`, `lecture_sources.created_by`, `security_logs.user_id`, `usage_interactions.user_id` | Foreign-key columns without indexes can make deletes/updates slow and lock-prone. | Add non-unique indexes on confirmed missing FK columns; do not remove existing indexes. | Draft adds `ingestion_jobs.source_id`, `lecture_sources.created_by`, and guarded `security_logs.user_id`. `usage_interactions.user_id` is manual-confirmation-only because repo SQL already has `(user_id, created_at desc)`. | Low for included indexes; low/medium for redundant usage index. | Supabase linter no longer reports FK index warnings; query plans remain healthy. | Automated SQL review plus linter rerun. |
| Mutable `search_path` on `match_lecture_chunks` and `match_persona_snippets` | Functions without explicit `search_path` can resolve objects unexpectedly. | Recreate functions with `set search_path = public` because repo SQL installs `vector` without a schema. Use `public, extensions` only after confirming the live extension schema. | Draft updates both repo-known functions with `set search_path = public`. | Medium: must preserve RAG retrieval return shape exactly. | Lecture Mode/RAG queries still return chunks and citations. | Manual RAG smoke plus route tests. |
| `handle_new_user()` executable by anon/authenticated | A trigger helper should not be directly callable by regular users if it is `SECURITY DEFINER`. | Revoke direct execute from `anon` and `authenticated` only after inspecting the live function and staging-testing signup/profile creation. | Executable draft does not revoke this. A commented manual-confirmation snippet is included. | Medium/high: signup must still create profiles. | Signup creates profile after confirmation/OAuth. | Manual auth QA. |
| `rls_auto_enable()` executable by anon/authenticated | A security/admin helper should not be directly callable by regular users. | Revoke direct execute only after confirming no app/admin dependency. | Executable draft does not revoke this. A commented manual-confirmation snippet is included. | Medium/high: depends on whether any admin tooling calls it. | App still functions; admin-only workflows still work if expected. | Manual confirmation required. |

## 2. Should Fix Before Beta

| Warning | What it means | Safest fix | SQL/migration needed | Risk | Verification | Review type |
| --- | --- | --- | --- | --- | --- | --- |
| Mutable `search_path` on `handle_updated_at()` | Generic timestamp trigger function should resolve objects predictably. | Set explicit `search_path` only after inspecting the live function body and confirming whether it needs `auth` in search path. | Executable draft does not alter this function. Commented manual-confirmation SQL is included. | Low/medium: can affect update triggers if function body assumes another schema. | Updated rows still maintain `updated_at`. | Manual plus small update smoke. |
| Mutable `search_path` on `handle_new_user()` | Signup trigger helper should not rely on caller search path. | Set explicit `search_path` only after reviewing the live function body and staging-testing signup/profile creation. | Executable draft does not alter this function. Commented manual-confirmation SQL is included. | Medium/high: auth signup flow depends on it. | Signup and OAuth profile bootstrap still work. | Manual auth QA. |
| Dashboard-only `profiles`, `chats`, `messages`, `security_logs` RLS performance warnings | These are likely app-critical policies not represented in repo SQL. | Use Supabase dashboard/SQL dump to identify policy names, then apply `(select auth.uid())` changes. | Not fully drafted because policy names are unknown locally. | Medium/high: incorrect policy edits can block login/history or expose data. | Profile/settings, chat history, and security logging still behave correctly. | Manual review required. |

## 3. Can Wait Until After Beta

| Warning | Why it can wait | Future fix |
| --- | --- | --- |
| `vector` extension installed in `public` | Moving extensions is a larger operational change and can break function signatures or existing indexes if rushed. | Plan a separate staged migration to install/move `vector` into an `extensions` schema and update references safely. |
| Unused indexes | Current linter set mentions FK/index warnings, not confirmed harmful unused indexes. Removing indexes can hurt future workloads. | Collect query stats after beta; remove only with evidence. |
| Full automated live Supabase policy tests | Valuable but requires controlled beta accounts and safe credentials. | Add a dedicated non-production integration test suite later. |

## 4. Risky Changes That Need Manual Confirmation

- Moving the `vector` extension out of `public`.
- Rewriting dashboard-only policies for `profiles`, `security_logs`, `chats`, and `messages` without a schema dump.
- Consolidating `usage_interactions` SELECT policies without confirming every existing policy and intended role.
- Adding `usage_interactions_user_id_idx` before confirming whether the existing `(user_id, created_at desc)` index satisfies the FK warning.
- Revoking function execution from `PUBLIC` broadly. The draft does not execute helper-function revokes; even `anon`/`authenticated` revokes should be staged manually.
- Changing `handle_updated_at()` without inspecting the live function body and retesting timestamp behavior.
- Changing `handle_new_user()` without testing signup, email confirmation, OAuth, and profile creation.
- Using `set search_path = public, extensions` before confirming the live `vector` extension lives in `extensions`.

## 5. Proposed Migration File

Draft file:

`scripts/sql/supabase-linter-remediation-draft.sql`

Apply only to staging/preview first. Do not run against production until the manual verification checklist passes.

## 6. Manual Verification Checklist

### RLS And Ownership

- [ ] User can read/update only their own `profiles` row.
- [ ] User can create, load, rename, pin, and delete only their own `chats`.
- [ ] User can read only messages for their own chats.
- [ ] Public artifacts remain readable only when `is_public = true`.
- [ ] Private artifacts remain owner-only.
- [ ] Artifact save, update, and delete still work for the owner.
- [ ] Calendar events remain owner-only.
- [ ] `usage_interactions` remains metadata-only and scoped/available exactly as intended.
- [ ] `training_interactions` remains consent-gated.

### Lecture And RAG

- [ ] `lecture_sources` remains globally readable.
- [ ] `lecture_chunks` remains globally readable.
- [ ] Logged-in and logged-out lecture counts match.
- [ ] Lecture Mode returns citations/source cards when grounded.
- [ ] Related Lectures remain recommendations, not fake sources.
- [ ] `match_lecture_chunks` returns the same columns as before.
- [ ] `match_persona_snippets` returns the same columns as before.
- [ ] Live vector extension schema is confirmed before changing RAG RPC search path beyond `public`.

### Auth And Functions

- [ ] New signup still creates a profile through `handle_new_user()`.
- [ ] Email confirmation redirects correctly.
- [ ] Google OAuth still bootstraps profile metadata if enabled.
- [ ] Password reset still works.
- [ ] Live `handle_updated_at()` body is inspected before any search path change.
- [ ] `handle_updated_at()` still updates timestamps in staging after any manual hardening.
- [ ] Live `handle_new_user()` body is inspected before any search path or execute revoke change.
- [ ] `handle_new_user()` signup/profile creation works in staging before production.
- [ ] `rls_auto_enable()` is confirmed unused by app/admin regular-user workflows before any execute revoke.

### Linter Recheck

- [ ] Supabase linter no longer reports fixed `auth_rls_initplan` warnings for migrated policies.
- [ ] Supabase linter no longer reports fixed FK-index warnings.
- [ ] Supabase linter no longer reports mutable `search_path` for migrated functions.
- [ ] Supabase linter confirms whether the existing `usage_interactions_user_created_idx` satisfies the usage FK warning.
- [ ] Remaining warnings are documented as intentionally deferred.

## 7. Risks / Things Not Changed

- Production is not mutated by this plan or draft.
- The draft does not remove unused indexes.
- The draft does not move the `vector` extension.
- The draft does not guess dashboard-only policy names for `profiles`, `security_logs`, `chats`, or `messages`.
- The draft does not consolidate unknown `usage_interactions` SELECT policies.
- The executable draft does not alter `handle_updated_at()`.
- The executable draft does not alter `handle_new_user()` or revoke `handle_new_user()` / `rls_auto_enable()` execution.
- The executable draft does not add a potentially redundant `usage_interactions_user_id_idx`.
- The draft does not broaden any RLS access intentionally.
