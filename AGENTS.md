<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# NikiAI Agent Rules

## Project Overview

NIKIAI is a study assistant with chat, math help, Pure Logic mode, Nemanja Mode, Lecture Mode, artifacts, uploads, Focus Mode, settings, auth, and study continuity.

The product should feel reliable, calm, source-aware, and useful for real study sessions. Preserve existing working flows unless the user explicitly asks to change them.

## Primary Objective

Complete the requested task safely. When `PLANS.md` contains active reliability work, treat it as the source of truth for known pending issues and avoid contradicting it.

## Safety Rules

- Do not redesign the app unless the user explicitly asks for a redesign.
- Do not remove working features.
- Do not rewrite large files unless clearly necessary.
- Do not change behavior outside the requested scope.
- Prefer small, targeted edits over broad refactors.
- Do not change routing unless the task specifically requires it.
- Do not change chat, math, RAG, auth, uploads, settings, or artifact behavior while working on unrelated areas.
- Do not invent database fields, table names, Supabase policies, or storage buckets.
- If the worktree already contains unrelated edits, do not revert them. Work around them and mention them when relevant.

## Development Rules

- Read the relevant files before editing.
- Follow the existing project structure and naming conventions.
- Preserve TypeScript types and avoid `any` unless the surrounding code already requires it.
- Keep UI style, spacing, colors, and component patterns consistent with the current app.
- Use existing components, hooks, helpers, and storage keys where possible.
- Check Supabase assumptions before changing data logic, RLS-sensitive queries, or user-scoped persistence.
- User-owned data must always be filtered by the current user where applicable.
- Global lecture data must not become user-scoped unless explicitly requested.
- Keep comments sparse and useful.

## Math Integrity

Numerical parity between Pure Logic and Nemanja Mode is required. Persona, tone, and lecture style may change, but the final mathematical answer must not change unless the user changes the problem.

Math presentation should show the formula/rule, substitution, and simplified result when applicable. Prefer standard simplified or factored final forms.

## Formatting Integrity

Never remove `react-markdown`, `remark-math`, `rehype-katex`, or `katex` without replacing them with a verified rendering path. All model fallback output that may contain math must pass through the shared math sanitizer before reaching the UI.

## Test Discipline

If a test fails, do not move to the next checklist item. Fix the failing behavior or clearly mark the item as blocked with evidence. Run the narrowest relevant test first, then run the broader gate before claiming completion.

## RAG Discipline

Lecture Mode may synthesize transcript chunks into clean teaching, but it must not invent lecture-specific titles, timestamps, examples, professor claims, or source links. Empty retrieval must be stated plainly or handled with a generic non-lecture explanation.

Lecture Mode must be honest about source context:

- If lecture/RAG sources are used, show source-aware wording and citations/source UI as appropriate.
- If only uploaded file or pinned syllabus context is used, label it as attached context, not a lecture citation.
- If no source context is available, say so naturally.
- Keep Related Lectures fallback separate from true sources. Do not imply the answer was derived from related lectures.

## Auth And Session Boundaries

- Logged-in state must reflect the real Supabase session.
- Logged-out users may browse and use supported local features, but protected actions must explain that login is required.
- Never fake saved/persistent behavior for logged-out users.
- Clear or namespace user-specific localStorage by user ID.
- Do not let pinned syllabus, saved artifacts, recent artifact resume, chat history, uploads, or profile/settings state leak across logout or user switch.
- Profile/settings pages must handle missing sessions safely and calmly.

## Artifacts

- Artifacts must create, open, edit, save, reopen, export, and delete reliably.
- Logged-out users may generate, edit, and export artifacts, but permanent save must require login.
- Public/private artifact state must remain explicit and safe.
- Private artifacts must not be exposed through public artifact flows.
- Saved artifact updates and deletes must be scoped to the current user.

## Chat History

- Starting a new chat must not overwrite old chats.
- Loading a previous chat must verify ownership.
- Refreshing should not lose the selected saved chat when a logged-in user owns it.
- Logged-out history behavior must be clear and honest.
- Failed save/load operations should show calm notices without breaking the current chat.

## Pedagogical Style Requirements For Nemanja Mode

- Start with intuition when the user asks for a lecture, concept explanation, or recovery of missed class material.
- Keep routine homework answers efficient, but include the rule, formula, or shortcut that justifies the step.
- Do not skip useful efficiency tips when a professor-style shortcut is genuinely safer or faster than a generic textbook path.
- Use professor-style vocabulary only when it is supported by retrieved lecture evidence or established local prompt guidance. Do not force catchphrases.
- If describing a graph, diagram, board setup, or video moment, make the spatial relationship clear enough to understand without seeing the video.
- If a user sends a bare expression after a derivative, integral, limit, factor, simplify, expand, or solve request, inherit the recent operator when it is unambiguous. If it is ambiguous, ask what operation they want.
- Synthesize noisy transcript chunks into coherent teaching. Do not dump raw transcript trails as the main answer.
- Preserve math correctness above style. If a professor-style shortcut is used, finish the actual requested task.

## Release Hygiene

Do not commit generated response logs, cache folders, `__pycache__`, temporary files, or local environment secrets. Before a commit, run TypeScript, lint, math stability, sanitizer, API route, frontend contract, prompt regression, RAG route, and RAG nightmare checks when relevant.

## Validation

Before claiming completion, run the narrowest relevant checks first, then broader checks when practical:

- `npm run lint`
- `npx tsc --noEmit`
- Relevant contract or feature tests, such as `npm run test:frontend-contract`, `npm run test:api-route`, `npm run test:math-sanitizer`, `npm run test:math-stability`, or RAG tests when touched.

If a generic `npm run test` script is unavailable, say so. Always provide manual QA steps for the changed flow.

## Response Format After Work

When finishing an implementation task, summarize:

- Files changed
- Summary of changes
- Behavior preserved
- Tests run
- Manual verification steps

If something could not be verified, say exactly what was not run and why.

## Checkpointing

After several substantial tasks, summarize progress in `CHECKPOINT.md` or the conversation before continuing, especially if the work is moving into a new category.
