# NikiAi: Decentralized Inference & Academic Assistant

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-Database_&_Auth-3ECF8E?style=for-the-badge&logo=supabase)
![Ollama](https://img.shields.io/badge/Ollama-Local_Inference-white?style=for-the-badge&logo=ollama)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?style=for-the-badge&logo=vercel)

NikiAi is a full-stack, context-aware AI orchestrator designed to assist with advanced mathematics and Data Science coursework. It bridges the gap between a highly available serverless frontend and a decentralized, privacy-first inference engine running on local consumer hardware.

## 🚀 Architecture overview

This project demonstrates a hybrid cloud/local infrastructure model:
1. **The Edge (Frontend):** A Next.js application hosted on Vercel, providing a highly responsive, persistent UI.
2. **The Auth & Storage:** Supabase handles secure user authentication (OAuth) and persistent chat history via PostgreSQL.
3. **The Tunnel:** An Ngrok secure tunnel exposes a localized API endpoint to the public web.
4. **The Inference Engine:** All natural language and mathematical processing is handled entirely offline by a local **RTX 5070 Ti** running `qwen2.5:7b` via Ollama.

This architecture ensures zero API costs for token generation, total data privacy for academic materials, and extremely low-latency inference.

## ✨ Core Features

* **Decentralized Hardware Inference:** Bypasses commercial APIs (OpenAI, Anthropic) in favor of local GPU processing, demonstrating fundamental infrastructure routing.
* **Persistent Session Management:** Implements robust Supabase Auth with state hydration to maintain user sessions and chat histories across browser refreshes and tab switching.
* **Advanced Mathematical Rendering:** Integrates `react-markdown`, `remark-math`, and `rehype-katex` with a sanitizer/audit layer so complex LaTeX formulas, deterministic math templates, and Qwen fallback responses render consistently in the UI.
* **Dynamic Persona Toggling:** Allows the user to switch between Pure Logic, Nemanja Mode, and Lecture Mode while preserving the same math correctness target.
* **Lecture-Grounded Source Cards:** RAG answers surface clickable YouTube timestamp cards with thumbnails, confidence labels, and an in-app clip preview modal, so the student can jump back to the exact lecture moment.
* **Tutor Callouts:** Longer lecture-style answers can highlight Efficiency Tips, Lecture Connections, Common Mistakes, Checkpoints, and Concept Checks as distinct study aids.
* **Push-to-Talk Input:** Chrome/Edge users can dictate a study question directly into the composer through the browser Speech Recognition API.

## 🛠️ Tech Stack

* **Frontend:** Next.js, React, Tailwind CSS
* **Backend & Auth:** Supabase (PostgreSQL)
* **Local LLM Server:** Ollama (Qwen 2.5 7B Instruct)
* **Network Routing:** Ngrok
* **Deployment:** Vercel

## 🔮 Future Roadmap: RAG Implementation

The next phase of NikiAi focuses on **Retrieval-Augmented Generation (RAG)**. 
I am currently processing unstructured data (lecture transcripts from YouTube playlists) to generate vector embeddings. These will be stored using Supabase's `pgvector` extension. Once complete, NikiAi will query this vector database prior to local inference, anchoring the LLM's mathematical explanations directly to specific, verified lecture materials to eliminate hallucination.

### RAG retrieval quality checks

After ingesting lectures, run retrieval checks locally:

```bash
npm run test:rag-quality:calc
npm run test:rag-quality:calc:c1
npm run test:rag-quality:ml
npm run test:rag-quality:calc:file
npm run test:rag-quality:all
npm run test:rag-quality:core-courses
```

You can also run the checker directly with filters:

```bash
node scripts/check-rag-quality.mjs --suite calc --courseFilter "Calc 1" --professorFilter "Prof Nemanja" --maxChunks 10
```

### Math stability and response audits

Run the deterministic formatting checks before trusting a math-formatting change:

```bash
npm run test:math-sanitizer
npm run test:math-stability
npm run test:frontend-contract
npm run test:response-audit
npm run test:math-live -- --stress --limit=34 --out=scripts/response_logs_clean102.json
npm run audit:responses -- scripts/response_logs_clean102.json
```

For larger stress runs, use:

```bash
npm run test:math-live -- --stress --out=scripts/response_logs_stress_full900.json
npm run audit:responses -- scripts/response_logs_stress_full900.json
```

The response auditor categorizes failures as `[SAN]` sanitizer leaks, `[UI]` rendering-breaking output, `[DISC]` mode answer discrepancies, and `[RAG]` grounding issues. It also reports the current clean streak and the unique failure patterns in the last 250 responses.

### Vercel + Ollama connectivity

When NikiAi is deployed on Vercel, `localhost` or `127.0.0.1` points at the Vercel server, not your PC. To use your local Ollama backend from the deployed site:

```bash
ollama serve
ngrok http 11434
```

You can verify that ngrok is exposing the correct port before touching Vercel:

```bash
npm run check:ollama-tunnel
```

If this reports that ngrok is pointing at `localhost:3000`, that tunnel is exposing the Next.js app, not Ollama. Vercel needs a tunnel to port `11434`.

Set `OLLAMA_API_URL` in Vercel to the public ngrok HTTPS URL, then redeploy or restart the deployment. Use this diagnostic endpoint to verify the deployed app can see Ollama:

```text
/api/ollama/health
```

If chat returns a local model backend error, check that the ngrok tunnel is still running, `OLLAMA_API_URL` matches the current tunnel URL, and the target model is installed in Ollama.

Free ngrok URLs change whenever the tunnel restarts. If Vercel still points at an old URL, update `OLLAMA_API_URL`, redeploy, then check `/api/ollama/health` before testing chat again. The API sends the `ngrok-skip-browser-warning` header for both chat and health checks so ngrok's browser warning page does not get mistaken for Ollama.

### Current polish backlog

These are intentionally tracked as product polish, not correctness blockers:

1. Add optional syllabus/Canvas-style context from a local CSV or uploaded file.

---
*Developed by Brandon Hargadon*
