# RAG Assistant — Summary

**Version:** 0.2.23 · **Date:** 2026-03-24

---

## What is this?

A RAG-based document analysis assistant built on the [SDSC Conversational Toolkit](https://github.com/SwissDataScienceCenter/sme-kt-zh-collaboration-rag).
Ask questions about your documents — answers come with explicit source references.

**Supported formats:** PDF, EPUB, DOCX, XLSX, MD, TXT

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + Python 3.13 |
| Frontend | Next.js 15 (pages router), Tailwind, TypeScript |
| Embedding | SentenceTransformer (local/offline) · Ollama · LiteLLM · custom OpenAI-compatible endpoint |
| LLM | Ollama · OpenAI · Anthropic · LiteLLM |
| Vector DB | ChromaDB (local) or pgvector (PostgreSQL) — selectable per knowledge base |
| Retrieval | Semantic + BM25 via RRF · HyDE · Query Expansion · LLM Reranking |

---

## Quick Start

```bash
# Backend
cd backend
conda activate rag-venv
BACKEND=ollama python -m sme_kt_zh_collaboration_rag.main

# Frontend (separate terminal)
cd frontend
cp .env.example .env    # set API_KEY
npm install && npm run dev
# → http://localhost:3000
```

> **Authentication:** Set `API_KEY` in `frontend/.env` before starting.
> Without it the login will not work.

---

## Architecture

```
Browser
  └─ Next.js Frontend (Port 3000)
       └─ FastAPI Backend (Port 8080)
            ├─ KB Router        — Multi-KB registry, hot-swap
            ├─ RAG Router       — Retrieval / LLM configuration
            ├─ OpenAI Compat    — /v1/chat/completions (Open WebUI, curl)
            └─ Controller       — Conversation streaming
                 └─ RAG Agent
                      ├─ HybridRetriever (Semantic + BM25 + RRF)
                      ├─ LLM (Ollama / OpenAI / Anthropic / LiteLLM)
                      └─ JSON-structured output (answer + sources + follow-ups)
```

---

## Features

- **Multi-KB** — Multiple knowledge bases, hot-swap without restart
- **Hybrid Retrieval** — Semantic + BM25 + RRF; optional HyDE, Query Expansion, LLM Reranking
- **Flexible Embedding** — `local` (SentenceTransformer), `ollama`, `litellm`, `custom` (any OpenAI-compatible endpoint); per-KB configuration
- **Flexible Vector DB** — ChromaDB (local) or pgvector (PostgreSQL), selectable per KB
- **Structured LLM Output** — JSON with `answer`, `used_sources_id`, `follow_up_questions`
- **Source References** — Filename-based, no UUID hallucinations
- **Auth** — Password-protected via cookie, `/login` page
- **OpenAI-compatible Endpoint** — `/v1/chat/completions` for Open WebUI, curl, etc.
- **EPUB / DOCX Chunking** — via MarkItDown
- **i18n** — DE / EN / FR / IT
- **Generation Stats** — query duration, tokens/second, model name per response
- **Conversation Management** — rename, delete, group by session label

---

## GitHub Contribution

**Repository:** [SwissDataScienceCenter/sme-kt-zh-collaboration-rag](https://github.com/SwissDataScienceCenter/sme-kt-zh-collaboration-rag)
**Fork:** [voninsight/sme-kt-zh-collaboration-rag](https://github.com/voninsight/sme-kt-zh-collaboration-rag)
**Branch:** `feature/multi-kb-hybrid-rag`

### How to contribute / open a PR

1. Fork the upstream repository on GitHub
2. Clone your fork locally
3. Create a feature branch based on `upstream/main`
4. Implement and test your changes
5. Push to your fork and open a Pull Request against `SwissDataScienceCenter/sme-kt-zh-collaboration-rag` → `main`

### What this PR contributes

All extensions were developed by **Vonlanthen INSIGHT** (Patrik Vonlanthen) and are documented in [CONTRIBUTORS.md](CONTRIBUTORS.md):

| Area | Contribution |
|---|---|
| Backend | Multi-KB architecture, KB registry, hot-swap without restart |
| Backend | pgvector alongside ChromaDB — per-KB vector store selector |
| Backend | Hybrid retrieval: BM25 + semantic via RRF |
| Backend | Query expansion, HyDE, LLM reranking |
| Backend | Async refactoring: non-blocking embeddings, ChromaDB, BM25 |
| Backend | Critical bug fix: stream sentinel in `controller.py` |
| Backend | MarkItDown chunker: EPUB, DOCX, DOC support |
| Backend | OpenAI-compatible endpoint (`/v1/chat/completions`) |
| Frontend | RAG config panel: collapsible right-side panel with presets |
| Frontend | Login / passcode authentication |
| Frontend | Conversation grouping by date and session label |
| Frontend | Generation statistics (duration, tokens/s, model) |
| Frontend | Full i18n: DE / FR / IT translations for all new UI |

### Before submitting the PR

```bash
cd insight-contrib

# 1. Verify no private content
grep -r "vonlanthen\|secusuisse\|l\.one\.i234\|192\.168\." frontend/src backend/ -i

# 2. Build check
cd frontend && npm run build

# 3. Commit
cd ..
git add -A
git commit -m "feat: multi-KB hybrid RAG, usability extensions, i18n, auth"

# 4. Push to fork
git push origin feature/multi-kb-hybrid-rag

# 5. Open PR on GitHub:
#    Base: SwissDataScienceCenter/sme-kt-zh-collaboration-rag → main
#    Head: voninsight/sme-kt-zh-collaboration-rag → feature/multi-kb-hybrid-rag
```

---

## Known Issues / Open Points

| # | Issue | Priority |
|---|---|---|
| 1 | Images/tables not extracted from PDFs | High |
| 2 | Incremental indexing not implemented (always `reset=True`) | Medium |
| 3 | pgvector: connection instability (LAN dependency, no fallback) | Medium |
| 4 | Mobile layout: RAG Config Panel always visible | Low |
