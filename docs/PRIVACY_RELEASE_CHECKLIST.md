# NIKIAI Privacy And Release Checklist

Use this checklist before beta invites, production deploys, or Supabase policy changes. It is intentionally practical: automated checks catch source-level contracts, and manual checks cover dashboard/runtime behavior that should not be faked offline.

## Automated Gates

Run these before release:

```bash
npx tsc --noEmit
npm run lint
npm run test:frontend-contract
npm run test:privacy-boundaries
npm run test
npm run test:e2e
```

The privacy boundary check verifies:

- Chat history queries and mutations are scoped by `user_id`.
- Saved artifact reads, updates, and deletes are scoped by owner.
- Public artifact discovery only returns rows where `is_public = true`.
- Upload paths are login-gated and user-prefixed.
- Profile, personalization, and settings updates target the current user profile.
- Global lecture data remains public/global and is not accidentally filtered by user.
- Training logs require `train_on_data`.
- Usage logs require `share_usage_data` and stay metadata-only.
- User-owned artifact resume/library state clears after logout.
- Sensitive chat/RAG debug logs are development-gated.

## Supabase RLS Checklist

Verify these policies in the Supabase dashboard before release:

- `study_artifacts`
  - RLS enabled.
  - Users can select, insert, update, and delete only their own rows.
  - Public discovery can select only `is_public = true`.
  - Existing private artifacts remain private after migrations.
- `calendar_events`
  - RLS enabled.
  - All operations require `auth.uid() = user_id`.
- `lecture_sources` and `lecture_chunks`
  - RLS enabled.
  - `SELECT` policy uses `true` because lecture knowledge is global.
  - No user uploads or private syllabus data lives in these tables.
- `training_interactions`
  - RLS enabled.
  - Written only by server/service-role code after explicit `train_on_data` consent.
  - Not used as normal chat history.
- `usage_interactions`
  - RLS enabled.
  - Written only by server/service-role code after `share_usage_data` consent.
  - Contains metadata only, never message text or file contents.

## Storage Boundary Checklist

Verify storage bucket rules manually:

- `chat-uploads`
  - Upload paths are user-prefixed: `userId/chatId/timestamp.ext`.
  - Uploads require login.
  - Users cannot read, overwrite, or list other users' prefixes.
  - Files are not public unless intentionally exposed.
- `Avatars`
  - Paths are user-prefixed.
  - Public read is acceptable only for avatar images.
  - Users cannot overwrite another user's avatar path.

## Auth And Session Checklist

- Login refresh preserves only the current user's profile, settings, chat history, and artifacts.
- Logout clears user-scoped UI state, current chat id, saved artifact resume, pinned syllabus, and protected prompts.
- Switching accounts without a hard reload does not flash old user data.
- Forgot-password redirect points to `/update-password`.
- Email confirmation redirects to the app and shows a clear success state.

## Data Logging Checklist

- Production logs do not print full prompts, generated responses, file contents, access tokens, refresh tokens, or service role keys.
- Development-only logs stay behind `NODE_ENV !== "production"` checks.
- Training logs sanitize obvious auth/password tokens before insert.
- Usage logs include only coarse metadata: mode, teaching state, course/topic context, and timestamps.
- Unexpected production errors use privacy-safe structured logging only.
- Error boundary logs include action/digest metadata, not rendered private study content.
- API route logs include route/action and safe metadata, not request bodies.

## Environment Readiness

Confirm these are configured in production and preview environments:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` if Lecture Mode/RAG embeddings are enabled.
- `OLLAMA_API_URL` or the intended model endpoint.
- Supabase Auth site URL and redirect URLs for:
  - `/auth/callback`
  - `/auth/confirmed`
  - `/update-password`

Do not commit `.env.local`, service role keys, logs containing prompts, exported database dumps, or user-uploaded files.

## Manual Release QA

- Logged out:
  - Chat works where local use is supported.
  - Protected actions show calm login prompts.
  - No saved artifact resume, chat history, profile, or syllabus from a previous user appears.
- Logged in:
  - Start a chat, refresh, and reopen it from history.
  - Save, reopen, update, export, and delete an artifact.
  - Confirm private artifacts do not appear in public discovery.
  - Upload a chat file and confirm it stays attached to the current chat/user.
  - Update settings/profile and refresh to confirm persistence.
- Lecture Mode:
  - Grounded answers show lecture sources.
  - Ungrounded answers do not claim fake source support.
  - Related Lectures are recommendations, not citations.
- Mobile:
  - Sidebar opens/closes.
  - Composer remains usable.
  - Study controls do not block the chat.

## Defer To A Separate Branch

- Live two-account Supabase RLS tests with seeded users.
- Storage bucket policy integration tests.
- Real email confirmation/password reset E2E with a test inbox.
- Production log-drain audit after deploy.
- Load/performance testing for large uploads and long streaming responses.
