# NIKIAI Beta Audit Results

Use this file to record the live Supabase/Vercel beta-readiness audit.

Do not paste secrets into this file. Do not paste private prompts, uploaded file contents, private artifacts, profile data, tokens, cookies, API keys, service-role keys, or real secret values. Screenshots should hide secret values.

## 1. Audit Metadata

| Field | Value |
| --- | --- |
| Date | TBD |
| Tester | TBD |
| Environment | Production / Preview / Local |
| Production URL | `https://your-prod-domain` |
| Supabase project | `your-supabase-project-name-or-id` |
| Vercel deployment | `your-vercel-deployment-id-or-url` |

## 2. Automated Validation Results

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | `npx tsc --noEmit` | TypeScript passes | TBD | TBD |
| Not started | `npm run lint` | Lint passes | TBD | TBD |
| Not started | `npm run test` | Full local contract suite passes | TBD | TBD |
| Not started | `npm run test:e2e` | Playwright smoke suite passes | TBD | TBD |
| Not started | `npm run build` | Production build passes | TBD | TBD |
| Not started | `npm run test:privacy-boundaries` | Privacy/data-boundary contracts pass | TBD | TBD |
| Not started | `npm run test:session-boundaries` | Session-boundary contracts pass | TBD | TBD |
| Not started | `npm run test:safe-logging` | Safe-logging contracts pass | TBD | TBD |
| Not started | `npm run test:performance` | Performance guardrails pass | TBD | TBD |
| Not started | `npm run test:frontend-contract` | Frontend contracts pass | TBD | TBD |

## 3. Quick 30-Minute Audit Results

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | Production deploy loads | Home page opens; no crash | TBD | TBD |
| Not started | Env vars present | Required variable names exist in correct Vercel scopes | TBD | Do not record secret values |
| Not started | Supabase Site URL | Site URL points to production domain | TBD | Use placeholder or redacted screenshot |
| Not started | Redirect URLs | Auth callback, confirmation, and reset URLs allowed | TBD | TBD |
| Not started | RLS spot check | User-owned tables have RLS enabled | TBD | TBD |
| Not started | Public artifact check | Private hidden; public visible | TBD | Do not paste artifact content |
| Not started | Login/logout boundary | Logout clears user-owned UI state | TBD | TBD |
| Not started | Chat smoke | Safe test message gets response | TBD | Do not paste private prompts |
| Not started | Mobile smoke | Composer usable; sidebar closes | TBD | TBD |

## 4. Full Audit Results

### Supabase Auth

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | Site URL | `https://your-prod-domain` configured | TBD | TBD |
| Not started | Redirect URLs | `/auth/callback`, `/auth/confirmed`, `/update-password` allowed | TBD | TBD |
| Not started | Email confirmation | Signup email confirms and returns to app | TBD | TBD |
| Not started | Password reset | Reset email opens `/update-password`; new password works | TBD | TBD |
| Not started | Google OAuth, if enabled | OAuth returns through `/auth/callback` | TBD | Mark N/A if disabled |

### Database/RLS

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | `chats` RLS | Own-row select/update/delete only | TBD | TBD |
| Not started | `messages` RLS | Messages accessible only for owned chats | TBD | TBD |
| Not started | `profiles` RLS | User selects/updates own profile only | TBD | TBD |
| Not started | `study_artifacts` RLS | Private owner-only; public rows selectable | TBD | TBD |
| Not started | `calendar_events`, if used | Own-row operations only | TBD | Mark N/A if unused |
| Not started | `training_interactions` | Consent-gated server writes only | TBD | TBD |
| Not started | `usage_interactions` | Metadata-only consent-gated rows | TBD | TBD |

### Storage

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | `chat-uploads` bucket policy | Login required; user prefix protected | TBD | TBD |
| Not started | Upload path ownership | Paths use `userId/chatId/timestamp.ext` | TBD | Do not paste private file names if sensitive |
| Not started | Cross-user upload access | User B cannot read/list User A uploads | TBD | TBD |
| Not started | `Avatars` bucket policy | Public read acceptable; writes scoped | TBD | TBD |
| Not started | Pinned syllabus/files | Private context clears on logout/user switch | TBD | Do not paste file contents |

### Lecture/Knowledge Data

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | `lecture_sources` policy | Global readable with `SELECT using true` | TBD | TBD |
| Not started | `lecture_chunks` policy | Global readable with `SELECT using true` | TBD | TBD |
| Not started | Lecture counts | Logged-in and logged-out counts match | TBD | TBD |
| Not started | User upload separation | Private uploads do not become global lecture data | TBD | TBD |
| Not started | Lecture Mode honesty | Sources only shown when actually used | TBD | TBD |

### Vercel Environment

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | `NEXT_PUBLIC_SUPABASE_URL` | Present in correct scope | TBD | Do not record value |
| Not started | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Present in correct scope | TBD | Do not record value |
| Not started | `SUPABASE_SERVICE_ROLE_KEY` | Server-only; not public-prefixed | TBD | Do not record value |
| Not started | `OPENAI_API_KEY`, if used | Present for RAG embeddings | TBD | Do not record value |
| Not started | `OLLAMA_API_URL` or model endpoint | Present and reachable | TBD | Redact private URL if needed |
| Not started | Preview vs production scoping | Intentional separation | TBD | TBD |

### Deployment Verification

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | Vercel production build | Build passes | TBD | TBD |
| Not started | Route health | App and dynamic routes respond | TBD | TBD |
| Not started | Chat route health | Safe test prompt returns response | TBD | Do not paste private prompt |
| Not started | RAG route health | Sources or honest fallback | TBD | TBD |
| Not started | Rollback path | Previous known-good deployment available | TBD | TBD |

### Production Browser Smoke

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | Logged-out home | Home loads; composer visible | TBD | TBD |
| Not started | Signup/login/logout | State updates cleanly | TBD | TBD |
| Not started | Password reset | New password works | TBD | TBD |
| Not started | Chat send | User and assistant messages render | TBD | Do not paste private prompt |
| Not started | Chat history restore | Correct messages reload after refresh | TBD | TBD |
| Not started | Uploads | Logged out gated; logged in works | TBD | Do not paste file content |
| Not started | Lecture Mode | Honest source/fallback messaging | TBD | TBD |
| Not started | Artifacts | Create, save, reopen, delete works | TBD | Do not paste artifact content |
| Not started | Settings/profile | Harmless setting persists after refresh | TBD | TBD |
| Not started | Mobile sidebar/composer | Sidebar closes; composer remains usable | TBD | TBD |

## 5. Two-User Isolation Checks

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | User A chat history | User A sees their own saved chats | TBD | TBD |
| Not started | User B cannot see User A chat history | User B sees none of User A's chats | TBD | TBD |
| Not started | User A private artifact | User A can save a private artifact | TBD | Do not paste content |
| Not started | User B cannot see User A private artifact | User B cannot find/open User A private artifact | TBD | TBD |
| Not started | User A upload path | User A upload path is user-prefixed | TBD | Redact user ID if desired |
| Not started | User B cannot read/list User A upload | Access denied or not listed | TBD | TBD |

## 6. Issues Found

| ID | Severity | Area | Description | Steps to reproduce | Expected | Actual | Status | Fix/decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TBD-001 | TBD | TBD | TBD | TBD | TBD | TBD | Not started | TBD |

Severity options: Low, Medium, High, Critical.

Status options: Not started, Pass, Fail, Blocked, N/A.

## 7. Beta Go/No-Go Decision

| Field | Value |
| --- | --- |
| Decision | Go / No-go / Conditional go |
| Reason | TBD |
| Must-fix list | TBD |
| Can-wait list | TBD |

### Decision Checklist

| Status | Check | Expected | Actual | Evidence/notes |
| --- | --- | --- | --- | --- |
| Not started | Auth production flows pass | Signup, login, logout, reset work | TBD | TBD |
| Not started | RLS/storage boundaries pass | No cross-user private access | TBD | TBD |
| Not started | Public/private artifacts pass | Private hidden; public visible | TBD | TBD |
| Not started | Production chat works | Safe prompt gets response | TBD | TBD |
| Not started | Mobile smoke passes | Composer/sidebar usable | TBD | TBD |
| Not started | Automated gates pass | Required local checks green | TBD | TBD |
| Not started | Rollback path ready | Known-good deployment available | TBD | TBD |

## 8. Sign-Off

| Field | Value |
| --- | --- |
| Tester | TBD |
| Date | TBD |
| Notes | TBD |
