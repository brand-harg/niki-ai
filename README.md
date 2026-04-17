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
* **Advanced Mathematical Rendering:** Integrates `react-markdown`, `remark-math`, and `rehype-katex` to seamlessly sanitize and render complex LaTeX formulas and calculus outputs natively in the UI.
* **Dynamic Persona Toggling:** Allows the user to switch the AI's operational mode between "Pure Logic" and a specialized academic persona ("Nemanja Mode") tailored for Calculus III.

## 🛠️ Tech Stack

* **Frontend:** Next.js, React, Tailwind CSS
* **Backend & Auth:** Supabase (PostgreSQL)
* **Local LLM Server:** Ollama (Qwen 2.5 7B Instruct)
* **Network Routing:** Ngrok
* **Deployment:** Vercel

## 🔮 Future Roadmap: RAG Implementation

The next phase of NikiAi focuses on **Retrieval-Augmented Generation (RAG)**. 
I am currently processing unstructured data (lecture transcripts from YouTube playlists) to generate vector embeddings. These will be stored using Supabase's `pgvector` extension. Once complete, NikiAi will query this vector database prior to local inference, anchoring the LLM's mathematical explanations directly to specific, verified lecture materials to eliminate hallucination.

---
*Developed by Brandon Hargadon*