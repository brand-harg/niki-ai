<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# NikiAI Agent Rules

## Primary Objective

Complete the work tracked in `PLANS.md`. Treat that file as the source of truth for active and pending reliability work.

## Math Integrity

Numerical parity between Pure Logic and Nemanja Mode is required. Persona, tone, and lecture style may change, but the final mathematical answer must not change unless the user changes the problem.

## Formatting Integrity

Never remove `react-markdown`, `remark-math`, `rehype-katex`, or `katex` without replacing them with a verified rendering path. All model fallback output that may contain math must pass through the shared math sanitizer before reaching the UI.

## Test Discipline

If a test fails, do not move to the next checklist item. Fix the failing behavior or clearly mark the item as blocked with evidence. Run the narrowest relevant test first, then run the broader gate before claiming completion.

## RAG Discipline

Lecture Mode may synthesize transcript chunks into clean teaching, but it must not invent lecture-specific titles, timestamps, examples, professor claims, or source links. Empty retrieval must be stated plainly or handled with a generic non-lecture explanation.

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

## Checkpointing

After several substantial tasks, summarize progress in `CHECKPOINT.md` or the conversation before continuing, especially if the work is moving into a new category.
