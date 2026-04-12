# RAG Assistant — Summary

**Version:** 0.2.26 · **Date:** 2026-04-12 · **Maintained by:** rlei-odes

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
- **Session Label Pills** — reuse past session tags via pills (localStorage per device); × to remove, clear all
- **Per-group Delete** — delete all conversations in a session-tag group or date group via hover trash icon + confirm dialog
- **Sidebar Badges** — KB name · LLM short name · T= · emb: · k= · BM25 · Rerank · HyDE · QExp under each chat
- **Message Footer** — LLM model · duration · tok/s (no KB/emb in footer)
- **Indexing Stop Button** — cancel running indexing with confirm dialog; already-indexed chunks preserved
- **Backend Status Banner** — red banner bottom-left when backend unreachable; green flash on recovery

---

## Vector Store Options

Each KB selects its own vector store backend independently:

| Backend | When to use |
|---|---|
| **ChromaDB** (default) | Local, no dependencies, works out of the box |
| **pgvector** | PostgreSQL available — supports LAN/remote instances, better suited for larger scale or shared infrastructure |

pgvector can point to a PostgreSQL instance anywhere on the network (e.g. a NAS, a dedicated DB server, or a remote host) by configuring the connection string per KB. ChromaDB requires no server — data lives in a local directory.

---

## Contributing

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the full contribution history.
Upstream: [SwissDataScienceCenter/sme-kt-zh-collaboration-rag](https://github.com/SwissDataScienceCenter/sme-kt-zh-collaboration-rag)

---

## Known Issues / Open Points

| # | Issue | Priority |
|---|---|---|
| 1 | Images/tables not extracted from PDFs | High |
| 2 | Incremental indexing not implemented (always `reset=True`) | Medium |
| 3 | pgvector: connection instability (LAN dependency, no fallback) | Medium |
| 4 | Mobile layout: RAG Config Panel always visible | Low |
