# CHANGELOG

All notable changes to the TRAG fork are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [TRAG v0.2.29] — 2026-04-16 · rlei-odes

### Fixed — Markdown and Plain-Text Ingestion

`MarkdownChunker._pdf2markdown` was missing `**kwargs`, causing all `.md` and `.txt` files to fail with `unexpected keyword argument 'do_ocr'` and produce 0 chunks. Added `**kwargs` to absorb PDF-specific parameters passed by the parent `make_chunks`.

### Fixed — Reindex Proxy Timeout

`POST /reindex` previously held the HTTP connection open until ingestion completed. The Next.js Flatpak proxy would time out on large KBs, returning a 500 to the frontend while the job continued silently in the backend.

- `POST /reindex` now returns `{"started": true}` immediately; the job runs as a FastAPI background task
- `last_result` added to `IndexStatus` and populated by `rebuild_callback` on completion
- Frontend polling loop extended with `prevFinishedAt` detection (same pattern as the indexing progress modal) to show the success toast and refresh the KB registry when the job finishes

---

## [TRAG v0.2.28] — 2026-04-14 · rlei-odes

### Added — Ingestion Deduplication

Content-hash based deduplication prevents redundant parsing and embedding when the same
file is encountered more than once, either across runs or within a single batch.

- `file_hash()` — SHA-256 fingerprint of raw file bytes; content-based, filename-agnostic
- `_collect_candidate_files()` — shared helper for file discovery (extension, size, EVALUATION filter), used by both the dedup pre-pass and `load_chunks`
- Pre-pass in `_run_ingestion`: hashes all candidate files in an executor before parsing; applies cross-run dedup (skip if hash already in store) and within-batch dedup (skip duplicate content in the same run); only files that pass both checks reach `load_chunks`
- `load_chunks` gains `include_files` and `file_hashes` params; stamps every chunk with `chunk.metadata["file_hash"]` for future lookups; falls back to on-the-fly hashing when called standalone (notebook compatible)
- `build_vector_store` removes the all-or-nothing `current_count > 0` guard (which silently skipped new files on incremental runs); groups chunks by `file_hash`, skips groups already in the store; accepts `existing_hashes` from caller to avoid a second full metadata scan
- `VectorStore.get_file_hashes()` — new abstract method; implemented in `ChromaDBVectorStore` (metadata-only scan via `run_in_executor`) and `PGVectorStore` (DISTINCT SQL on `chunk_metadata["file_hash"]`)
- `ReindexResult` gains `files_skipped` field; success toast in all four UI languages shows skipped count when non-zero
- Warning logged when a store is non-empty but has no `file_hash` metadata (KB indexed before this feature; first incremental run re-embeds everything, subsequent runs are incremental)
- `ARCHITECTURE.md`: new Ingestion Pipeline chapter documenting the full flow, dedup layers, key functions, and threading model

---

## [TRAG v0.2.27] — 2026-04-13 · rlei-odes

### Added — Project Tooling
- `CLAUDE.md` — AI assistant briefing: project overview, key files, current config, development guidelines, security principles, commit convention, documentation drift rules
- `start.sh` / `stop.sh` rewritten — self-contained, path-independent, starts both backend and frontend in the background with PID tracking and log files in `logs/`
- `start.sh`: Ollama health check on startup; warns if Ollama is unreachable or configured model is not pulled (reads model name from `rag_config.json` dynamically)

### Added — Documentation
- `README.md`: Known Issues section added
- `CHANGELOG.md`: changelog reference added to `CLAUDE.md`

### Changed — Frontend
- Temperature hint updated in all four languages (DE/EN/FR/IT) to show `default: 0.2 (recommended for RAG)`
- `DEFAULT_SESSION.llm_temperature` aligned to `0.2` to match `rag_config.json`
- `frontend/package.json`: removed `open-browser` script and auto-launch from `dev` command (was hardcoded to wrong port 3001, opened browser before server was ready)

### Removed
- `SUMMARY.md` — redundant with `README.md`; Known Issues section preserved and moved to `README.md`

---

## [TRAG v0.2.26] — 2026-04-12 · rlei-odes

### Fixed — Merge Conflict Resolution
Resolved leftover upstream merge conflict markers across four files, keeping the fork's HEAD version in each case:
- `conversational-toolkit/src/conversational_toolkit/chunking/pdf_chunker.py` — guard `write_images` flag before creating image output directory
- `conversational-toolkit/src/conversational_toolkit/llms/local_llm.py` — lazy `MessageContent` import; use `raw_content` variable consistently
- `conversational-toolkit/src/conversational_toolkit/conversation_database/controller.py` — retain keepalive SSE streaming logic (`asyncio.wait` + timeout sentinel)
- `backend/src/sme_kt_zh_collaboration_rag/utils/json.py` — retain pre-compiled `_CODE_FENCE_RE` regex and fork's JSON parse logic

### Fixed — Dependencies
- `requirements.txt`: added `einops` (required by `nomic-ai/nomic-embed-text-v1` via SentenceTransformers)

### Fixed — VectorStore Abstraction
- Added `get_source_files()` abstract method to `VectorStore` base class
- Implemented in `ChromaDBVectorStore` (metadata-only fetch via `run_in_executor`) and `PGVectorStore` (async `DISTINCT` SQL query)
- Removed two `isinstance(vs, ChromaDBVectorStore)` checks from `main.py` that bypassed the abstraction and left pgvector without a file list
- Extracted `_inject_source_files()` async helper — called from `rebuild_callback` and `_startup` so both backends get the indexed file list injected into the agent system prompt
- Removed `ChromaDBVectorStore` import from `main.py` — no longer needed

### Added — Prompt File Management
- System prompt extracted from hardcoded Python string into `prompts/system_prompt.default.md` — committed, ships as the baseline
- `prompts/system_prompt.custom.md` — gitignored; written automatically when user saves a custom prompt via the UI, never pushed to the repo
- Load priority: custom file → default file; clearing the prompt in the UI deletes the custom file and resets to default
- `rag_config.json` no longer stores `system_prompt` — prompt lives exclusively in the file system

### Fixed — Repository Hygiene
- `.gitignore`: added `.venv/` entry (was listed as `venv/` only, causing IDE source control noise on fresh installs)

---

## [TRAG v0.2.25] — 2026-03-26 · Vonlanthen INSIGHT

This release represents the full TRAG production stack on top of the SDSC baseline.

### Added — Multi-KB Architecture
- KB registry (`knowledge_bases.json`) with support for N independent knowledge bases
- Hot-swap active KB at runtime via `POST /kb/active` — no restart required
- Per-KB configuration: vector store, embedding backend, embedding model, retrieval params
- Indexing control: progress tracking, cancellation (`POST /kb/{id}/cancel`), 409 guard
- KB Router (`kb_router.py`) as dedicated FastAPI router

### Added — Vector Store
- pgvector backend (`PgVectorVectorStore`) as alternative to ChromaDB
- Vector store selector per KB in knowledge_bases.json (`"vector_store": "chromadb" | "pgvector"`)

### Added — Retrieval
- BM25 sparse retrieval (rank_bm25 library)
- Hybrid retrieval: BM25 + semantic fusion via Reciprocal Rank Fusion (RRF)
- HyDE (Hypothetical Document Embeddings) — improves recall on indirect queries
- Query expansion — multi-query fusion via RRF
- LLM reranking — cross-encoder quality pass on retrieval candidates
- All retrieval features configurable per session, persisted in `rag_config.json`

### Added — Embedding Backends
- LiteLLM embedding backend (`LiteLLMEmbeddings`) — any OpenAI-compatible embed endpoint
- Ollama embedding backend (`OllamaEmbeddings`)
- Custom embedding backend with configurable base URL
- Embedding backend selector per KB

### Added — LLM Backends
- Anthropic LLM backend (`AnthropicLLM`)
- LiteLLM LLM backend (`LiteLLMLLM`) — routes to any provider via proxy
- Dynamic Ollama model list fetched from local server at runtime

### Added — Chunking
- MarkItDown chunker (`markitdown_chunker.py`) — EPUB, DOCX, DOC support

### Added — OpenAI-Compatible Endpoint
- `POST /v1/chat/completions` — maps to active KB RAG query
- `GET /v1/models` — returns available KBs as model list
- Works with Open WebUI, curl, n8n, and any OpenAI-compatible client

### Added — Frontend (RAG Config Panel)
- Collapsible right-side RAG Parameters panel (`rag-config-panel.tsx`)
- Live parameter tuning: K, BM25, HyDE, Query Expansion, Reranking, temperature
- Presets: fast / balanced / quality
- Re-index button with live progress and cancel
- LLM model selector with dynamic Ollama list
- Embedding backend and model configuration

### Added — Frontend (Sidebar & Session Management)
- Config badges per conversation: KB · LLM · T= · emb: · k= · BM25 · Rerank · HyDE
- Session labels for A/B evaluation grouping
- Per-session delete
- Hover tooltip with full config snapshot

### Added — Frontend (Auth)
- Password-protected login page (`/login`)
- Session cookie authentication (`rag_auth`)
- Middleware protecting all routes
- `POST /api/auth/login` and `POST /api/auth/logout` handlers

### Added — Frontend (i18n)
- Internationalization: DE / EN / FR / IT
- Language auto-detection from browser
- All UI strings externalized to `frontend/src/lib/lang/`

### Added — Frontend (Generation Stats)
- Per-response footer: LLM model name · query duration · tokens/second

### Added — Deployment
- Systemd user service templates (`insight-backend.service`, `insight-frontend.service`)
- nginx reverse proxy configuration (`nginx.conf`)
- `.env.example` for frontend
- Multi-device proxy rewrite setup (SERVER_URL="" pattern)

### Fixed — Async Architecture
- Full `asyncio` + `run_in_executor` refactor throughout backend
- Fixes SSE/streaming blocking under concurrent load
- SentenceTransformer, ChromaDB, BM25 all non-blocking

### Fixed — Stream Sentinel
- `AttributeError` on response end in `controller.py` when stream sentinel was `None`
- Fixes frontend hanging on query completion in certain LLM backends

---

## [Upstream Baseline] — 2026-03 · SDSC

Notebook material reviewed and finalized by Paulina Koerner (SDSC):
- All feature notebooks (`feature0a` through `feature4e`) reviewed and corrected
- `feature4` utility file created
- mypy warnings resolved

Original baseline implemented by the Swiss Data Science Center (SDSC):
- 5-stage RAG pipeline: chunk → embed → store → retrieve → generate
- ChromaDB vector store
- SentenceTransformer embeddings
- Ollama and OpenAI LLM backends
- RAGAS evaluation framework integration
- Structured evidence outputs (VERIFIED / CLAIMED / MISSING / MIXED)
- BM25 + hybrid RRF retrieval (notebook implementation)
- HyDE and query expansion (notebook implementation)
- Agent and tool-use notebooks
- PrimePack AG scenario dataset with deliberate flaws

---

