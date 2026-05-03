# NIKIAI Live Beta Audit Procedure

Use this ordered procedure against the real Supabase and Vercel setup before inviting beta users. Local validation is already strong, but live Auth settings, RLS policies, storage policies, environment scoping, deployed route behavior, two-user isolation, and rollback readiness still need manual verification.

> Safety: Do not paste secrets. Do not paste private prompts, uploads, artifacts, tokens, cookies, API keys, or full user data. Screenshots must hide secret values.

## How To Use These Docs

- Use `docs/SUPABASE_RELEASE_QA.md` as the reference checklist for what beta-ready means.
- Use this file as the live audit runbook, in order.
- Use `docs/BETA_AUDIT_RESULTS.md` to record pass/fail results, evidence, issues, and sign-off.
- When recording status, use only: `Not started`, `Pass`, `Fail`, `Blocked`, or `N/A`.

## 1. Quick 30-Minute Audit

| Step | Check | Where | Expected result | Red flag | Proof |
| --- | --- | --- | --- | --- | --- |
| 1 | Production deploy loads | Vercel -> latest Production URL | Home page opens; no crash | Blank page, 500, or infinite loading | Screenshot |
| 2 | Env vars present | Vercel -> Project -> Settings -> Environment Variables | Supabase URL/anon, server keys, and model URLs exist in correct scope | Missing value or preview/prod mismatch | Screenshot names/scopes only |
| 3 | Supabase Site URL | Supabase -> Auth -> URL Configuration | `https://your-prod-domain` | Localhost, old preview URL, or missing URL | Screenshot |
| 4 | Redirect URLs | Supabase -> Auth -> URL Configuration | Callback, confirmed, and update-password URLs allowed | Auth emails redirect to the wrong URL | Screenshot |
| 5 | RLS spot check | Supabase -> Table Editor -> Policies | RLS enabled on user-owned tables | User-owned table without RLS | Screenshot |
| 6 | Public artifact check | App + `study_artifacts` | Private hidden, public visible | Private artifact appears publicly | Screenshot |
| 7 | Login/logout boundary | Production app | Logout clears profile/history/artifacts | Old user data remains visible | Screenshot |
| 8 | Chat smoke | Production app | Send one message; response appears | Stuck loading or 500/502 | Screenshot |
| 9 | Mobile smoke | Browser mobile viewport or device | Composer usable; sidebar closes | Input blocked by controls/sidebar | Screenshot |

## 2. Full 2-Hour Audit

Run the phases below in order. Use two dedicated beta-test accounts where cross-user behavior is checked. Save screenshots of settings and pass/fail outcomes, but never capture secret values.

| Phase | Goal | Estimated time |
| --- | --- | --- |
| Phase 1 | Confirm Auth URL/email/OAuth behavior | 20 minutes |
| Phase 2 | Verify database RLS and user ownership | 30 minutes |
| Phase 3 | Verify storage bucket access boundaries | 20 minutes |
| Phase 4 | Confirm Vercel environment scoping | 15 minutes |
| Phase 5 | Confirm deployment health and rollback path | 15 minutes |
| Phase 6 | Run production browser smoke flows | 20 minutes |
| Phase 7 | Verify two-user isolation boundaries | 20 minutes |

## 3. Phase 1: Supabase Auth Configuration

| Item | Where to check | What to click/look for | Expected result | Red flag | Proof |
| --- | --- | --- | --- | --- | --- |
| Site URL | Supabase Dashboard -> Auth -> URL Configuration | Check Site URL | Production URL, e.g. `https://your-prod-domain` | Localhost, preview URL, or missing URL | Screenshot |
| Redirect URLs | Auth -> URL Configuration | Check allowed redirect URLs | Includes `/auth/callback`, `/auth/confirmed`, `/update-password`, and needed Vercel preview URLs | Missing callback/reset URLs | Screenshot |
| Email confirmation | Auth -> Providers -> Email | Confirm email confirmation matches beta intent | Signup emails are sent and return users to the app | Users stuck unconfirmed | Screenshot |
| Signup flow | Production app -> Signup | Create test user | Confirmation email received; user confirms and logs in | No email or broken redirect | Screenshot |
| Password reset | Production app -> Forgot password | Request reset for test user | Email opens `/update-password`; new password works | Fresh link shows expired/invalid state | Screenshot |
| Google OAuth, if enabled | Supabase Auth -> Providers -> Google + app login | Click Google login | Returns through `/auth/callback`; profile loads | Redirects to localhost or fails | Screenshot |

## 4. Phase 2: Supabase RLS Verification

| Item | Where to check | What to click/look for | Expected result | Red flag | Proof |
| --- | --- | --- | --- | --- | --- |
| `chats` | Supabase -> Table Editor -> chats -> Policies | RLS enabled; own-row policies | Select/update/delete scoped by `auth.uid() = user_id` | Any user can read all chats | Screenshot |
| `messages` | Table Editor -> messages -> Policies | Messages protected through owned chat/user logic | Users access only their own chat messages | Unrestricted message select | Screenshot |
| `profiles` | Table Editor -> profiles -> Policies | Own profile only | User selects/updates own row only | Authenticated user can update all profiles | Screenshot |
| `study_artifacts` | Table Editor -> study_artifacts -> Policies | Own rows plus public select | Private rows owner-only; public rows `is_public = true` | Private rows globally readable | Screenshot |
| `calendar_events`, if used | Table Editor -> calendar_events -> Policies | Own rows only | All operations require `auth.uid() = user_id` | Shared private calendar data | Screenshot |
| `training_interactions` | Table Editor -> training_interactions | RLS enabled; service writes only | Rows only after `train_on_data` consent | Rows appear without consent | Screenshot |
| `usage_interactions` | Table Editor -> usage_interactions | Metadata-only rows | No prompt, response, file, or private content | Message text stored | Screenshot |
| `lecture_sources` | Table Editor -> lecture_sources -> Policies | Public/global select | `SELECT using true` | Logged-in users see fewer lectures | Screenshot |
| `lecture_chunks` | Table Editor -> lecture_chunks -> Policies | Public/global select | `SELECT using true` | RAG fails only for authenticated users | Screenshot |

## 5. Phase 3: Supabase Storage Verification

| Item | Where to check | What to click/look for | Expected result | Red flag | Proof |
| --- | --- | --- | --- | --- | --- |
| `chat-uploads` bucket | Supabase -> Storage -> chat-uploads -> Policies | Upload/read/list rules | Login required; user prefix protected | Anonymous writes or public private files | Screenshot |
| Upload path ownership | Storage browser after a test upload | Path format | `userId/chatId/timestamp.ext` | Flat/global file path | Screenshot |
| Cross-user upload access | Two test accounts | Try accessing User A file as User B | Access denied | User B can view/list User A files | Screenshot |
| `Avatars` bucket | Storage -> Avatars -> Policies | Public read/write scope | Public read acceptable; writes scoped to owner path | Anyone can overwrite avatars | Screenshot |
| Pinned syllabus/files | App logout/user switch | Check uploaded/private context | Private context clears on logout/user switch | Old syllabus sent after logout | Screenshot |

## 6. Phase 4: Vercel Environment Verification

Capture variable names and environment scopes only. Do not capture secret values.

| Item | Where to check | What to click/look for | Expected result | Red flag | Proof |
| --- | --- | --- | --- | --- | --- |
| Supabase URL | Vercel -> Project -> Settings -> Environment Variables | `NEXT_PUBLIC_SUPABASE_URL` exists | Correct Supabase project URL in production scope | Points to wrong project | Screenshot names/scopes only |
| Supabase anon key | Vercel env | `NEXT_PUBLIC_SUPABASE_ANON_KEY` exists | Public anon key set for intended scopes | Missing anon key | Screenshot names/scopes only |
| Service role key | Vercel env | `SUPABASE_SERVICE_ROLE_KEY` exists | Server-only env, not exposed as public | Starts with `NEXT_PUBLIC_` or exposed client-side | Screenshot name/scope only |
| OpenAI key | Vercel env | `OPENAI_API_KEY`, if RAG is used | Present for lecture embeddings | Lecture retrieval fails silently | Screenshot name/scope only |
| Model URL | Vercel env | `OLLAMA_API_URL` or intended model endpoint | Production route can reach model | Chat route returns 502 | Screenshot name/scope only |
| Preview/prod scoping | Vercel env scopes | Check Production vs Preview | Intentional separation | Preview writes to production unintentionally | Screenshot scopes only |

## 7. Phase 5: Deployment Verification

| Item | Where to check | What to click/look for | Expected result | Red flag | Proof |
| --- | --- | --- | --- | --- | --- |
| Production build | Vercel deployment logs | Build status | Build passes | Type/build failure | Screenshot |
| Route health | Production app/API routes | Visit app and simple health routes if available | App and dynamic routes respond | 500/502 on key routes | Screenshot |
| Chat route health | Production app | Send a safe test prompt | Response streams/returns | Stuck loading or model error | Screenshot |
| RAG route health | Lecture Mode query | Ask source-aware question | Sources or honest fallback | Fake source or route failure | Screenshot |
| Rollback path | Vercel deployments | Confirm previous deployment available | Can promote/rollback quickly | No known rollback target | Screenshot |

## 8. Phase 6: Production Browser Smoke Test

| Flow | Where | What to do | Expected result | Red flag | Proof |
| --- | --- | --- | --- | --- | --- |
| Logged-out home | Production app | Open in fresh/incognito browser | Home loads; composer visible | Crash or infinite loading | Screenshot |
| Signup/login/logout | Production app | Signup test user, confirm, log in, log out | State updates cleanly | Stale user UI after logout | Screenshot |
| Password reset | Production app | Request reset and set new password | New password works | Broken redirect | Screenshot |
| Chat send | Production app | Send safe prompt | User and assistant messages render | Stuck Thinking | Screenshot |
| Chat history restore | Logged-in app | Send chat, refresh, reopen old chat | Correct messages load | Chat overwritten or missing | Screenshot |
| Uploads | Logged out + logged in | Try upload logged out, then logged in | Logged out gated; logged in works | Silent failure or cross-user path | Screenshot |
| Lecture Mode | Chat controls | Ask lecture-backed and non-backed question | Honest source/fallback messaging | Fake lecture claim | Screenshot |
| Artifacts | Artifact workspace | Create, save, reopen, delete | Lifecycle works | Private/public mismatch | Screenshot |
| Settings/profile | Settings/profile pages | Change one harmless setting and refresh | Persists correctly | UI-only or stale state | Screenshot |
| Mobile sidebar/composer | Mobile viewport/device | Open/close sidebar, type message | Composer usable | Controls block input | Screenshot |

## 9. Phase 7: Two-User Isolation Checks

Use two dedicated beta-test accounts. Save proof of pass/fail outcomes, but do not capture private prompts, uploaded content, artifact contents, tokens, cookies, API keys, or full user data.

| Item | Where to check | What to click/look for | Expected result | Red flag | Proof |
| --- | --- | --- | --- | --- | --- |
| User A chat history | Production app as User A | Create a saved chat and refresh | User A sees their own saved chat | Chat is missing for the owner | Screenshot |
| User B chat history | Production app as User B | Log in as User B and open history | User B does not see User A chats | Cross-user chat history leak | Screenshot |
| User A private artifact | Production app as User A | Save a private artifact | User A can reopen it | Owner cannot reopen saved artifact | Screenshot |
| User B private artifact access | Production app as User B | Check artifact library/public views | User B cannot find/open User A private artifact | Private artifact visible to User B | Screenshot |
| Public artifact boundary | Production app as User A and User B | Mark one safe artifact public | Public artifact behaves intentionally; private artifacts stay hidden | Public flow exposes private rows | Screenshot |
| User A upload path | Production app + Supabase Storage | Upload a safe test file as User A | Path is user-scoped | Flat/global upload path | Screenshot with secrets hidden |
| User B upload access | Production app/storage policy check | Try User B access to User A upload | Access denied or not listed | User B can read/list User A upload | Screenshot |
| Logout boundary | Production app | User A logs out, then User B logs in | No User A profile/history/artifacts/upload context remains | Old user data flashes or persists | Screenshot |

## 10. Beta Go/No-Go Checklist

Go only if all are true:

- [ ] Auth Site URL and Redirect URLs are correct.
- [ ] Signup confirmation works.
- [ ] Password reset works.
- [ ] Google OAuth works if enabled.
- [ ] RLS is enabled on user-owned tables.
- [ ] Chat history is isolated between two users.
- [ ] Private artifacts do not appear publicly.
- [ ] Uploads are login-gated and user-prefixed.
- [ ] Two-user isolation checks pass for chat history, artifacts, uploads, and logout boundaries.
- [ ] Profile/settings are user-owned.
- [ ] Training logs require consent.
- [ ] Usage logs are metadata-only.
- [ ] Lecture tables are globally readable and not user-scoped.
- [ ] Production env vars are present in correct scopes.
- [ ] Production build passes.
- [ ] Chat, history, uploads, Lecture Mode, artifacts, settings, and mobile smoke tests pass.
- [ ] Rollback target is available.

## 11. Must Fix Before Beta

- Broken auth confirmation, reset, or OAuth redirect.
- Any RLS table allowing cross-user private data access.
- Any private artifact appearing in public discovery.
- Any upload readable or writable by the wrong user.
- Any two-user isolation failure involving chats, artifacts, uploads, settings, or profile state.
- Production logs exposing prompts, files, tokens, profiles, or private artifacts.
- Chat stuck loading in normal production use.
- Lecture Mode falsely claiming source support.
- No available rollback path.

## 12. Can Wait Until After Beta

- Lighthouse CI.
- Automated two-user Supabase integration tests.
- Automated storage policy tests.
- Full Sentry or third-party monitoring.
- Bundle analyzer budgets.
- Expanded browser matrix.
- Large-chat virtualization.
- Detailed analytics dashboards.

## 13. If A Serious Issue Is Found

| Step | Action |
| --- | --- |
| 1 | Pause beta invites immediately. |
| 2 | If private data may be exposed, disable the affected public route or feature path first. |
| 3 | If deployment caused it, rollback in Vercel to the last known-good deployment. |
| 4 | If policy caused it, fix Supabase RLS/storage policy before resuming. |
| 5 | Record only safe incident details: route/action, timestamp, deployment ID, and affected test user IDs. |
| 6 | Do not copy private prompts, uploaded files, artifacts, profiles, cookies, tokens, or secrets into notes. |
| 7 | Rerun `npm run test:privacy-boundaries`, `npm run test:session-boundaries`, `npm run test:e2e`, and `npm run build`. |
| 8 | Repeat the affected manual QA flow with two test users. |
| 9 | Resume beta only after the issue is understood, fixed, and rechecked. |
