# NIKIAI Supabase Release QA

Use this checklist before serious beta use. The local test suite is strong, but Supabase dashboard settings, storage policies, redirect URLs, production environment variables, and deployed behavior still need live/manual verification.

Do not paste secrets, real service-role keys, private URLs, user prompts, uploaded file contents, or private artifacts into this document.

## 1. Supabase/Auth QA

| Area | What to check | Where to check it | Expected result | Red flag | Type |
| --- | --- | --- | --- | --- | --- |
| Site URL | Production app URL is configured | Supabase Dashboard -> Auth -> URL Configuration | `https://your-prod-domain` | Localhost, old preview URL, or missing URL | Manual |
| Redirect URLs | Auth callback/reset URLs are allowed | Supabase Dashboard -> Auth -> URL Configuration | `/auth/callback`, `/auth/confirmed`, `/update-password`, and any needed Vercel preview URL | Confirmation/reset links fail or redirect to the wrong app | Manual |
| Email confirmation | New signup can confirm email | App signup flow + Supabase Auth users | User receives email, confirms, and can log in | User remains stuck unconfirmed or sees unclear state | Manual |
| Password reset | Forgot/reset flow works | App login/reset flow | Reset email opens `/update-password`; new password works | Expired/invalid links show raw or confusing errors | Manual |
| Login persistence | Refresh after login | Browser on deployed app | User remains logged in and sees correct profile/settings | Logged-out UI or stale local data after refresh | Manual |
| Logout boundary | Logout clears user-scoped UI | Browser on deployed app | History, saved artifacts, profile-only UI, and private context disappear | Previous user data remains visible | Manual |

## 2. Database/RLS QA

| Area | What to check | Where to check it | Expected result | Red flag | Type |
| --- | --- | --- | --- | --- | --- |
| `chats` | RLS enabled and own-row policies exist | Supabase Table Editor -> Policies | Select/update/delete scoped by `auth.uid() = user_id` | Any user can read all chats | Manual |
| `messages` | Messages are tied to owned chats | Supabase policies/SQL review | Users can access only messages for their own chats | Direct access to another user's messages | Manual |
| Chat history isolation | User A and User B cannot see each other's chats | Two test accounts in deployed app | Each user sees only their own conversations | Cross-account history leak | Manual |
| `study_artifacts` | RLS enabled and owner policies exist | Supabase Table Editor -> Policies | Private rows selectable only by owner | Private artifact visible to another user | Manual + automated |
| Public artifacts | Public discovery returns only public rows | `/api/artifacts/public` and table policies | Only `is_public = true` rows are returned | Private artifact content returned publicly | Manual + automated |
| Profile/settings | Profile updates are user-scoped | `profiles` policies and deployed app | User updates only their own profile/settings | User can update another profile | Manual |
| Calendar/events if used | Calendar rows are user-owned | `calendar_events` policies | All operations require `auth.uid() = user_id` | Private events shared across users | Manual |
| Training logs | Writes require explicit consent | `training_interactions` rows after chat tests | Rows appear only when `train_on_data = true` | Rows created without consent | Manual + automated |
| Usage logs | Metadata only and consent-gated | `usage_interactions` rows after chat tests | Course/mode metadata only; no prompt/response text | Message text or file content stored | Manual + automated |

## 3. Storage QA

| Area | What to check | Where to check it | Expected result | Red flag | Type |
| --- | --- | --- | --- | --- | --- |
| `chat-uploads` bucket | Upload requires login | Supabase Storage policies + deployed app | Logged-out upload is gated; logged-in upload works | Anonymous file writes | Manual |
| Upload paths | Files are user-prefixed | Supabase Storage browser | Paths look like `userId/chatId/timestamp.ext` | Flat/global paths or missing user prefix | Manual + automated |
| Upload reads | Users cannot read/list another user's files | Storage policies with two test users | User A cannot access User B prefix | Private uploads publicly readable | Manual |
| `Avatars` bucket | Avatar public read is intentional | Supabase Storage policies | Public read only for avatar images; writes scoped | Users can overwrite another avatar path | Manual |
| Pinned syllabus/files | Private context is session/user-scoped | Deployed app + storage | Logout/user switch clears private syllabus context | Old syllabus is sent after logout | Manual |

## 4. Lecture/Knowledge Data QA

| Area | What to check | Where to check it | Expected result | Red flag | Type |
| --- | --- | --- | --- | --- | --- |
| `lecture_sources` | Global lecture sources are readable | Supabase RLS policies | `SELECT` policy uses `true` because lecture data is global | Logged-in users see fewer lectures than logged-out users | Manual + automated |
| `lecture_chunks` | Global lecture chunks are readable | Supabase RLS policies | `SELECT` policy uses `true` | RAG fails only for authenticated users | Manual + automated |
| User upload separation | Private uploads are not global lecture data | Tables/storage review | User files stay in storage/private context | Uploaded file becomes public lecture source | Manual |
| Lecture Mode honesty | Grounded/fallback wording is accurate | Production app | Sources shown only when actually used; Related Lectures are recommendations | Fake citation/source claim | Manual |

## 5. Environment/Vercel QA

| Area | What to check | Where to check it | Expected result | Red flag | Type |
| --- | --- | --- | --- | --- | --- |
| Supabase public vars | URL and anon key are configured | Vercel Project -> Environment Variables | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present | Missing or pointing at wrong project | Manual |
| Service role key | Server-only key is configured safely | Vercel Project -> Environment Variables | `SUPABASE_SERVICE_ROLE_KEY` exists only as server env | Service key exposed client-side or committed | Manual |
| OpenAI key | RAG embeddings can run if enabled | Vercel env | `OPENAI_API_KEY` present if Lecture Mode/RAG embeddings are expected | Lecture retrieval fails silently | Manual |
| Model endpoint | Chat model endpoint is correct | Vercel env | `OLLAMA_API_URL` or intended model endpoint is set | Chat route returns 502 in production | Manual |
| Env separation | Preview/prod use intended resources | Vercel env scopes | Production points to production Supabase; preview is intentional | Preview writes to production unintentionally | Manual |
| Build | Production build passes | Local, CI, or Vercel deployment logs | `npm run build` green | Build/type failure | Automated |

## 6. Post-Deploy Smoke QA

| Flow | Expected result | Red flag | Type |
| --- | --- | --- | --- |
| Open production home | App loads and composer is usable | Blank page, crash, or infinite loading | Manual |
| Mobile home | Composer visible and controls compact | Controls block chat or input | Manual |
| Logged-out chat | Supported local use works or gated actions explain login | Silent failure | Manual |
| Login -> refresh | User remains logged in | User state lost or wrong profile shown | Manual |
| New chat -> history | Chat saves and reloads from history | New chat overwrites old chat | Manual |
| Artifact save/reopen/delete | Logged-in artifact lifecycle works | Artifact leaks, cannot reopen, or cannot delete | Manual |
| Public/private artifact | Private hidden, public visible | Private artifact appears publicly | Manual |
| Upload file | Logged out is gated; logged in works | Upload crosses users or fails silently | Manual |
| Lecture Mode | Source messaging is honest | Fake or incorrect source claims | Manual |
| Settings/profile | Changes persist after refresh | UI-only settings or stale user state | Manual |

## 7. Automated Gates Before Beta

Run locally before deploying or inviting beta users:

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run test:e2e
npm run build
```

Useful targeted checks when investigating release risk:

```bash
npm run test:privacy-boundaries
npm run test:session-boundaries
npm run test:safe-logging
npm run test:performance
npm run test:frontend-contract
```

## 8. Rollback Plan

| Step | Action |
| --- | --- |
| 1 | Keep the last known-good Vercel deployment available. |
| 2 | If the issue is UI/client-only, rollback the Vercel deployment. |
| 3 | If the issue is Supabase policy-related, pause beta access first, then fix the policy carefully. |
| 4 | If a data leak is suspected, immediately pause public artifact discovery and any affected protected route. |
| 5 | Preserve safe diagnostic details only: route/action names, affected user IDs, timestamps, and deployment ID. |
| 6 | Do not export private prompts, files, profiles, or artifact content unless absolutely required for incident response. |
| 7 | After fixing, rerun privacy/session/E2E checks and manually retest the affected flow. |

## 9. Beta Go/No-Go Checklist

Go only if all are true:

- [ ] Auth signup, confirmation, login, logout, and password reset work on production.
- [ ] Supabase RLS is verified for user-owned tables.
- [ ] Storage bucket policies are verified for uploads and avatars.
- [ ] Public/private artifacts are manually tested.
- [ ] Logged-in and logged-out lecture counts match.
- [ ] No private data appears after logout or account switch.
- [ ] Production environment variables are correct.
- [ ] `npm run build`, `npm run test`, and `npm run test:e2e` pass.
- [ ] Mobile composer/sidebar smoke test passes on a real device or browser emulation.
- [ ] Rollback path is known and tested enough to use quickly.

## 10. Must Fix Before Beta

- Any RLS policy allowing cross-user reads or writes.
- Any private artifact appearing in public discovery.
- Any upload accessible across users.
- Any broken auth redirect, email confirmation, or password reset flow in production.
- Any production route logging full prompts, messages, uploaded files, profile data, tokens, or private artifacts.
- Any logout/account-switch data leak.
- Any inability to rollback the deployment.

## 11. Can Wait Until After Beta

- Lighthouse CI automation.
- Full bundle analyzer budgets.
- Real two-account automated Supabase integration tests.
- Storage policy automated tests.
- Full third-party monitoring integration.
- Large-chat virtualization.
- More granular analytics dashboards.
- Broader browser matrix beyond the current Chromium smoke tests.
