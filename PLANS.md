# NikiAI Master Polish Checklist

This file is the source of truth for reliability work. Do not mark an item complete unless it is implemented, tested, and stable enough to survive repeat checks.

## Currently Fixing

1. Math fallback bug: stop vague math follow-ups such as `do ln5x` from falling into Qwen freestyle formatting.
2. Context-aware math follow-ups: inherit the previous math operator when the user sends only a bare expression.
3. Ambiguous math clarification: ask for the missing operation instead of guessing.
4. UI math wrapping: prevent math/prose overlap in checkpoints, callouts, source cards, and long KaTeX blocks.
5. Modular scaffolding synthesis: turn lecture recovery into `Intuition -> Definition -> Shortcut -> Application`, not transcript dumps.

## Already In Progress

6. Full-spectrum deterministic math audit across Calculus 1-3, statistics, matrices/eigenvalues, ODEs, complex numbers, and discrete math.
7. Sanitizer hardening against raw LaTeX leaks, forbidden delimiters, escaped currency, and prose inside math blocks.
8. Mode separation so Pure Logic, Nemanja, and Nemanja+Lecture sound visibly different without numerical mismatches.
9. RAG nightmare testing for wrong lecture retrieval, missing context, timeouts, broad topics, and hallucinated lecture details.
10. YouTube timestamp cross-reference checks for all lecture citations.

## Validation

11. Run the primary 12-problem math suite plus generated permutations.
12. Scale live response testing to 1000+ successful generations.
13. Reset clean-streak counters after sanitizer/RAG patches and require 100 clean responses for the changed category.
14. Compare Pure Logic vs Nemanja final answers for numerical parity.
15. Audit Nemanja persona drift across longer responses.
16. Verify pedagogical efficiency: Nemanja Mode should explain useful shortcuts without losing the original objective.

## Website And UX

17. Keep response layout clean, readable, and responsive.
18. Make source cards deep-link to valid timestamped YouTube clips.
19. Render lecture thumbnails and polished hover states for source cards.
20. Add Efficiency Tip sections when a professor-style shortcut is genuinely useful.
21. Keep Concept Check and active recall boxes readable and non-overlapping.
22. Add visual-description sync for lecture recovery when board/video context is referenced.
23. Polish push-to-talk behavior, intent routing, and latency.
24. Support local syllabus or assignment uploads as optional context.
25. Fix login-refresh/session persistence problems.
26. Add diagnostics for Vercel, Ollama, and ngrok connectivity.

## RAG Upgrades

27. Verify course/topic categorization for every lecture.
28. Add topic clarification gates for broad requests.
29. Improve narrative lesson synthesis from noisy transcripts.
30. Guard empty retrieval so the app never fakes lecture-specific details.
31. Extract recurring professor vocabulary, analogies, and shortcuts from lecture transcripts.
32. Map available lecture coverage against course syllabi for Calc 1-3, statistics, differential equations, elementary algebra, and related courses.
33. Stress-test Supabase query behavior and timeout handling.

## Release Hygiene

34. Run TypeScript with zero errors.
35. Run lint with zero errors.
36. Run math sanitizer and math stability checks.
37. Run API, frontend, prompt, RAG route, and RAG nightmare checks.
38. Run production build.
39. Remove generated test junk, temporary files, and accidental dev logs before committing.
40. Create a stable commit only after the relevant tests are green.
41. Keep work script-driven where possible so long runs create logs and can be resumed.
