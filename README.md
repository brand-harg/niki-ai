# NikiAI

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-Auth_&_Postgres-3ECF8E?style=for-the-badge&logo=supabase)
![Ollama](https://img.shields.io/badge/Ollama-Local_Chat_Model-white?style=for-the-badge&logo=ollama)
![OpenAI](https://img.shields.io/badge/OpenAI-Embeddings-412991?style=for-the-badge&logo=openai)

NikiAI is a study-focused AI workspace for math-heavy courses. It combines chat, lecture-aware retrieval, structured study artifacts, and personalized study context in one app.

The project is built around one core constraint: **Pure Logic and Nemanja Mode can differ in teaching style, but not in final mathematical correctness**.

## What NikiAI does

- **Pure Logic mode** for clean, direct math and technical answers
- **Nemanja Mode** for more guided, lecture-style teaching
- **Teaching Mode** for explicit formulas, substitutions, and worked steps
- **Knowledge Base controls** for course focus, lecture retrieval, source health, recent context, and pinned syllabus support
- **Study Artifacts** for notes, worked examples, summaries, and practice sets with save, reopen, edit, visibility control, and PDF export
- **Source transparency** with lecture/course labels, confidence, source cards, clip previews, and a source inspector
- **Session personalization** with saved response style, user context, default mode, and general settings
- **Auth-backed persistence** for chats, profile settings, artifacts, calendar events, and consent-gated logging

## Current product areas

### Chat and study flow

- New-session Quick Start prompts
- Focus Mode for course/topic context
- Practice Mode labeling for practice-heavy sessions
- Voice input
- Mobile-first collapsed controls
- Study-session identity and progress feedback in the chat UI

### Knowledge Base

- Active Lecture Set control
- Source Health with course breakdown
- Course chips that sync with Focus Mode
- Pinned Syllabus upload/pin/preview flow
- Recent Context restore
- Study Library and public artifact discovery in the sidebar

### Study Artifacts

- Open artifacts directly from chat
- Edit + live preview in the artifact workspace
- Save/update to `study_artifacts`
- Public/private visibility badge and toggle
- Resume recent artifact
- PDF export
- Unsaved changes protection

### Auth and persistence

- Email signup + confirmation flow
- Login/logout with live session hydration
- Password reset + update-password flow
- Logged-out local fallback for settings/personalization where appropriate
- Soft login prompts for gated actions

## Architecture

NikiAI currently uses a hybrid stack:

- **Frontend:** Next.js App Router, React, Tailwind
- **Primary data/auth layer:** Supabase
- **Chat inference:** Ollama via `OLLAMA_API_URL`
- **RAG embeddings and ingestion utilities:** OpenAI + Supabase
- **Math rendering:** `react-markdown`, `remark-math`, `rehype-katex`, `katex`

Important distinction:

- **Chat generation** is routed through the Ollama-backed chat path
- **Lecture retrieval / embeddings** use the OpenAI-backed RAG tooling where required

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env.local`

At minimum, configure:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
OLLAMA_API_URL=http://127.0.0.1:11434
```

Notes:

- `OPENAI_API_KEY` is required for lecture ingestion / embedding-backed retrieval flows
- `OLLAMA_API_URL` powers the chat model path
- for deployments that hit a machine outside the host environment, `OLLAMA_API_URL` must point to a reachable public tunnel rather than localhost

### 3. Run the required Supabase SQL

Apply these scripts in Supabase:

```text
scripts/sql/rag-foundation.sql
scripts/sql/calendar-events.sql
scripts/sql/study-artifacts.sql
scripts/sql/training-interactions.sql
scripts/sql/usage-interactions.sql
```

These cover:

- lecture/RAG tables and policies
- calendar events
- saveable study artifacts
- consent-gated training interactions
- metadata-only usage interactions

### 4. Start the app

```bash
npm run dev
```

### 5. Start Ollama if you are using the local chat model

```bash
ollama serve
```

If you need to expose local Ollama to a deployed environment:

```bash
ngrok http 11434
npm run check:ollama-tunnel
```

## Testing and verification

### Core app checks

```bash
npx tsc --noEmit
npm run lint
npm run test:frontend-contract
npm run test:api-route
npm run test:prompt
```

### Math stability checks

```bash
npm run test:math-sanitizer
npm run test:math-stability
npm run test:math-followups
npm run test:response-audit
```

### RAG checks

```bash
npm run test:rag-route
npm run test:rag-nightmares
npm run test:rag-quality:calc
npm run test:rag-quality:calc:c1
npm run test:rag-quality:ml
npm run test:rag-quality:all
npm run test:rag-quality:core-courses
```

### Live math stress checks

```bash
npm run test:math-live -- --stress --limit=34 --out=scripts/response_logs/live-check.json
npm run audit:responses -- scripts/response_logs/live-check.json
```

## Repository guide

- `app/page.tsx` - main study/chat screen
- `app/api/chat/route.ts` - main chat route, consent-gated logging, Ollama integration
- `app/api/rag/query/route.ts` - retrieval and embedding-backed lecture query path
- `components/` - extracted UI surfaces like chat controls, artifact workspace, knowledge base panel
- `hooks/` - extracted stateful UI logic
- `lib/` - shared helpers, formatting, storage, auth, and RAG helpers
- `scripts/` - contract checks, RAG tooling, diagnostics, ingestion utilities
- `scripts/sql/` - required database schema/policy scripts

## Product guardrails

- Math correctness must stay aligned between Pure Logic and Nemanja Mode
- Math output must continue flowing through the shared sanitizer/rendering path
- Lecture-grounded answers must stay honest about retrieval quality and mismatch
- Consent-gated training/usage logging must remain separate from normal chat persistence
- Private study artifacts and pinned syllabus data must not leak across sessions

## Project status

The app has moved well beyond a simple chat shell. The main active work is now reliability, polish, and keeping the study workflow coherent as features are extracted and stabilized.

For active engineering priorities, see:

- [PLANS.md](PLANS.md)
- [CHECKPOINT.md](CHECKPOINT.md)
- [AGENTS.md](AGENTS.md)

---

Built by Brandon Hargadon
