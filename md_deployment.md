# Deployment Analysis — voninsight-TRAG

> Living document — updated as we progress toward a company deployment.
> Cross-references the earlier analysis at `../sme-kt-zh-collaboration-rag/md_deplyoment.md`.

---

## Why this repo is the better deployment base

The previous analysis was done against the upstream
`sme-kt-zh-collaboration-rag` repo. This fork (`voninsight-TRAG`) adds a
significant set of production-relevant features that directly resolve the
blockers and to-dos identified there. The table below maps previous issues to
their status here.

| Previous issue | Status in this repo |
|---|---|
| Embedding model hardcoded to OpenAI | ✅ Resolved — `build_embedding_model()` supports `local` / `ollama` / `litellm` / `custom` with configurable `base_url` and `api_key` |
| ChromaDB always local (no HTTP mode for Phase 2) | ✅ Partially resolved — **pgvector** (PostgreSQL) is a first-class vector store; connect a remote Postgres and the problem is solved without needing ChromaDB HTTP mode |
| Ingestion only via Jupyter notebook | ✅ Resolved — API endpoint `POST /api/v1/rag/reindex` triggers ingestion; no Jupyter needed |
| Image embedding (`Qwen3VLEmbeddings`) loaded unconditionally | ✅ Not an issue — this fork's `main.py` does not wire `Qwen3VLEmbeddings`; startup is safe on CPU-only VMs |
| No multi-KB support | ✅ Resolved — full multi-KB registry with hot-swap, per-KB embedding config and vector store |
| No hybrid retrieval | ✅ Resolved — BM25 + semantic via RRF, plus HyDE, Query Expansion, LLM Reranking |
| No OpenAI-compatible endpoint | ✅ Resolved — `/v1/chat/completions` allows Open WebUI and curl to connect directly |
| Incremental indexing broken (all-or-nothing) | ⚠️ Still present — `build_vector_store()` skips embedding if the store is non-empty; per-document deduplication not yet implemented |
| PrimePack AG system prompt | ⚠️ Partially — `main.py` default prompt is now a generic German document-analysis prompt; `feature0_baseline_rag.py:152` still references PrimePack |
| Conversation history tied to cookie | ⚠️ Still present in Phase 1 — password/cookie auth only; OIDC not yet implemented |
| Flat JSON storage | ⚠️ Phase 2 item — Postgres conversation DB exists in conversational-toolkit but is not wired in `main.py` yet |

---

## Stack Overview

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI (uvicorn), Python 3.11+ |
| LLM | Ollama (default) · OpenAI · Anthropic · LiteLLM proxy · custom OpenAI-compat endpoint |
| Embedding | SentenceTransformer (local/offline) · Ollama · LiteLLM · custom OpenAI-compat endpoint |
| Vector Store | ChromaDB (local, per-KB) or pgvector (PostgreSQL, per-KB) — selectable per knowledge base |
| Conversation DB | JSON files (in-memory backed) — Postgres backend exists but not wired yet |
| Auth | Password-protected cookie (`/login` page + `SESSION_PASSWORD` env var) |
| i18n | DE / EN / FR / IT |

---

## How the App Is Structured

Same single-process model as the previous analysis: the FastAPI backend serves
both the Next.js static build and the RAG API on port 8080. The key new
structures in this fork:

- **Multi-KB registry** — `backend/db/knowledge_bases.json` lists all knowledge
  bases. Each KB has its own embedding config, vector store path/type, and data
  directories. The active KB is hot-swappable via `POST /api/v1/kb/{id}/activate`
  without a server restart.
- **Per-session RAG config** — `backend/db/rag_config.json` stores retrieval
  parameters (top-k, BM25, HyDE, reranking, LLM model) that take effect
  immediately without re-indexing.
- **Hot-swap proxy** — `_Proxy` in `main.py` wraps the vector store and RAG
  agent so the controller keeps its reference while the underlying object is
  replaced on a KB switch.
- **Ingestion API** — `POST /api/v1/rag/reindex` runs chunking + embedding in a
  background task; a cancel endpoint and progress polling are available.

---

## Critical Blocker: Unresolved Merge Conflicts

**The app will not start in its current state.** Files `main.py` and
`feature0_baseline_rag.py` contain unresolved git conflict markers
(`<<<<<<< HEAD`, `=======`, `>>>>>>> upstream/main`). Python treats these as
syntax errors.

**Files affected:**

| File | Conflict location |
|---|---|
| [backend/src/sme_kt_zh_collaboration_rag/main.py](backend/src/sme_kt_zh_collaboration_rag/main.py) | Lines 100–138 (log setup, env var defaults), lines 147–189 (SYSTEM_PROMPT vs upstream CustomRAG), lines 329–348 (split logic comment), lines 540–547 (embedding call) |
| [backend/src/sme_kt_zh_collaboration_rag/feature0_baseline_rag.py](backend/src/sme_kt_zh_collaboration_rag/feature0_baseline_rag.py) | Lines 329–347, 540–547 |

These must be resolved before any deployment or testing. In both cases the
**HEAD (local) version is the correct one** — it contains this fork's
additions. The `upstream/main` sections should be discarded.

---

## Phase 1 — Prototype Deployment

**Goal:** Get the app running for a small group of internal users with minimal
infrastructure changes. Validate the RAG use case before investing in
production infrastructure.

### What's already there (compared to the previous analysis)

Everything the previous analysis had, plus:

- **Multi-KB** — can have separate knowledge bases per project, per department,
  or per document set, all hot-swappable without a server restart
- **Advanced retrieval** — BM25 hybrid search, HyDE, query expansion, and LLM
  reranking are all UI-configurable per session
- **Configurable embedding backend** — `local` (SentenceTransformer, fully
  offline) is the default; switch to `custom` with a `base_url` to point at the
  Spark's embedding service in Phase 2 without any code change
- **pgvector support** — if a PostgreSQL instance is available (even on the App
  VM), KBs can use pgvector instead of local ChromaDB files. No code changes
  needed for Phase 2 remote vector store — just point the `vs_connection_string`
  at the Spark's Postgres.
- **LiteLLM backend** — points at a LiteLLM proxy for load balancing or
  model-switching without reconfiguring the app
- **OpenAI-compatible endpoint** — `/v1/chat/completions` allows Open WebUI to
  be pointed directly at this app

### Key Phase 1 limitation

Conversation history is tied to the password cookie session. If a user clears
cookies or switches browsers, they lose access to their history. Acceptable for
a controlled pilot — resolved in Phase 2 with OIDC.

### Deployment approach — direct install, no Docker needed

Same recommendation as the previous analysis: direct Python venv + systemd on
a VM, nginx in front for HTTPS. Docker adds no value at prototype scale.

### What needs to be done for Phase 1

| Task | Details |
|---|---|
| **Fix merge conflicts** | Resolve `<<<<<<< HEAD` / `>>>>>>>` markers in `main.py` and `feature0_baseline_rag.py` — keep HEAD version throughout; the app will not start otherwise |
| App VM setup | Python venv (3.11+), install backend (`pip install -e conversational-toolkit && pip install -e backend`), build frontend (`npm run build`) |
| systemd service | Run FastAPI as a managed service — auto-restarts on failure or reboot |
| Fix `SECRET_KEY` | Override `SECRET_KEY` env var (currently defaults to `"1234567890"` in `server.py:31`) |
| Set `SESSION_PASSWORD` | Gates `/login` page access during the pilot |
| Set `ENV=production` | Ensures cookies are set with `Secure` + `HttpOnly` flags |
| nginx + HTTPS | TLS termination; reverse proxy to FastAPI on port 8080 |
| Persistent `DB_DIR` | Default is `backend/db/` — ensure this path survives VM snapshots; set `DB_DIR` env var to a persistent volume if needed |
| Remove PrimePack prompt | `feature0_baseline_rag.py:152` still contains the PrimePack AG system prompt; it's only used when running the script standalone but should be cleaned up before any external sharing |
| Set up inference VM | Second CPU-only VM running Ollama — see model table below |

### Local LLM for Phase 1 — same recommendation as before

A second CPU-only VM runs **Ollama**. The backend just needs `OLLAMA_HOST`
pointed at this VM (the `ollama_host` field in the RAG config panel in the UI,
or set via the session config API). No code changes required.

| Model | Size (4-bit quant) | Notes |
|---|---|---|
| **Gemma 4 E2B** | ~3 GB | **Best choice** — 128K context, 140+ languages, manageable on CPU |
| **Gemma 4 E4B** | ~5 GB | Better quality, noticeably slower on CPU |
| **Llama 3.2 3B** | ~2 GB | Fallback; fastest, smaller context |

Inference VM specs: 8 vCPU, 16–32 GB RAM, 20 GB disk, no GPU.

### Embedding for Phase 1

Default embedding backend is `local` — `nomic-ai/nomic-embed-text-v1` via
SentenceTransformer. This is fully offline and requires no additional VM. It
downloads the model on first use (~300 MB) from HuggingFace.

> **Corporate network note:** SentenceTransformer downloads from HuggingFace on
> first run. Plan with IT if outbound internet is restricted. The model can be
> pre-downloaded and served from a local path by setting `HF_HUB_OFFLINE=1`
> and placing the model in the HuggingFace cache directory.

### Phase 1 architecture

```
Users (browser)
     │  HTTPS
     ▼
[App VM — direct install]
  nginx (TLS termination, port 443)
     │
  FastAPI / uvicorn (port 8080, systemd service)
  ├── serves frontend (static Next.js build)
  ├── Multi-KB manager (hot-swap)
  ├── RAG retrieval (BM25 + semantic + optional HyDE/rerank)
  ├── ChromaDB (in-process, per-KB) or pgvector
  ├── SentenceTransformer embeddings (local, offline)
  ├── Conversation storage (JSON files on DB_DIR)
  └── Ingestion API (POST /api/v1/rag/reindex)
     │
     │  internal network (Ollama / OpenAI-compat API)
     ▼
[Inference VM — CPU only, direct install]
  Ollama (systemd service)
  └── Gemma 4 E2B (or E4B / Llama 3.2 3B)
```

---

## Phase 2 — Production Deployment

**Goal:** Stable, secure, multi-user deployment for day-to-day company use.
Full identity integration, proper data persistence, GPU-accelerated inference
and retrieval on the NVIDIA Spark. No data leaves the company network.

### Hardware — same as previous analysis

**NVIDIA Spark** (GB10 Grace Blackwell, ~128 GB unified memory):
- LLM inference via vLLM
- Text embedding service (e.g. bge-m3 via vLLM or Infinity)
- Vector store — PostgreSQL + pgvector (recommended) or ChromaDB standalone
- Ingestion batch jobs (GPU-accelerated)

### What changes from the previous analysis — and what doesn't

The previous analysis identified several code changes needed for Phase 2. This
repo has already resolved most of them:

| Concern | Previous analysis | This repo |
|---|---|---|
| Embedding backend | Needed code change: `EMBEDDING_URL` env var, `base_url` to `AsyncOpenAI` | ✅ **Already done** — `custom` embedding backend with `base_url` + `api_key` per KB |
| Vector store remote mode | Needed code change: `CHROMA_HOST`/`CHROMA_PORT`, `chromadb.HttpClient` | ✅ **Already resolved differently** — pgvector via `vs_connection_string` works out of the box; point at Spark's Postgres |
| Image embedding service | Needed custom FastAPI microservice on Spark | ✅ **Not needed** — this fork does not use `Qwen3VLEmbeddings` in the main pipeline |
| LLM backend for vLLM | Needed `base_url` override | ✅ **Already done** — `custom` LLM backend or `litellm` backend both accept a `base_url` |
| Ingestion as CLI | Needed conversion from notebook | ✅ **Already done** — API endpoint `POST /api/v1/rag/reindex` |

### What still needs to be done for Phase 2

| Concern | What to do |
|---|---|
| **OIDC auth via AD FS** | Replace `SessionCookieProvider` in `server.py` with an OIDC middleware that validates tokens from the company's AD FS endpoint. Open WebUI also supports OIDC natively. |
| **Conversation storage → Postgres** | `conversational-toolkit` already has `PostgresConversationDatabase`, `PostgresMessageDatabase`, etc. in `conversation_database/postgres/`. Wire them up in `main.py`'s `build_server()` instead of the `InMemory*Database` calls, using a `DATABASE_URL` env var. |
| **Vector store → pgvector on Spark** | Create a KB with `vs_type=pgvector` and `vs_connection_string` pointing at the Spark's Postgres. No code change required — the factory in `feature0_baseline_rag.py:make_vector_store()` already handles this. |
| **Embedding → Spark** | In KB config, set `embedding_backend=custom`, `embedding_custom_base_url=http://<spark>/v1`, `embedding_custom_api_key=<key>`, `embedding_model=bge-m3` (or whichever model is served). No code change required. |
| **LLM → vLLM on Spark** | In RAG session config, set `llm_backend=custom`, `custom_base_url=http://<spark>/v1`, `custom_api_key=<key>`, `llm_model=<model-id>`. No code change required. |
| **Incremental indexing** | Add per-document content-hash deduplication to `build_vector_store()`. Currently the store is either fully reset or fully skipped — adding a new document to an existing KB does not index it without a full reset. |
| **Branding** | Clean up `feature0_baseline_rag.py:152` (PrimePack prompt). The main `SYSTEM_PROMPT` in `main.py` is already generic and configurable via `cfg.system_prompt` in the RAG config panel. |

### LLM model candidates — same as previous analysis

| Model | Params (active) | Context | Notes |
|---|---|---|---|
| **Gemma 4 26B A4B MoE** ✓ | 3.8B active / 25.2B total | 256K | **Recommended** — MoE: fast at near-7B cost, near-26B quality; 256K ideal for RAG |
| **Gemma 4 31B Dense** | 30.7B | 256K | Higher quality ceiling, slower than MoE |
| **Llama 3.3 70B** | 70B | 128K | Strong general-purpose; smaller context |

### Additional interfaces — unchanged from previous analysis

vLLM is the single backend; Open WebUI and optionally AnythingLLM point at it.
This app already exposes `/v1/chat/completions` so it can serve as a backend
for other clients too.

### Authentication — Local Active Directory

Replace `SessionCookieProvider` in
[conversational-toolkit/src/conversational_toolkit/api/server.py](conversational-toolkit/src/conversational_toolkit/api/server.py)
with an OIDC provider that validates tokens from the company's AD FS (local
Active Directory Federation Services). Microsoft Entra ID remains a secondary
option.

**Impact on conversation history:** Once users authenticate with their AD
identity, conversation history is tied to their stable corporate account and
persists across all devices — automatically.

### Phase 2 architecture

```
Users (browser)
     │  HTTPS
     ▼
[Reverse proxy — nginx / Traefik]
     ├── /          → RAG App (this repo)
     ├── /chat      → Open WebUI
     └── /docs      → AnythingLLM (optional)
          │
          ▼
[App Server — VM]
  ├── RAG FastAPI backend (this repo)
  │     ├── serves frontend (static Next.js build)
  │     ├── Multi-KB RAG API
  │     ├── OIDC auth → Active Directory / Entra ID
  │     └── Postgres (conversations, messages, reactions, users)
  ├── Open WebUI container
  └── AnythingLLM container (optional)
          │
          │  internal network (OpenAI-compatible API)
          ▼
[NVIDIA Spark — AI Server]
  ├── vLLM  (LLM inference, concurrent request handling)
  │     └── Gemma 4 26B A4B MoE (recommended)
  ├── Text embedding service (bge-m3 or nomic-embed-text via vLLM / Infinity)
  ├── PostgreSQL + pgvector (vector store — one table per KB)
  └── Ingestion batch jobs (GPU-accelerated, triggered via /api/v1/rag/reindex)
```

### What changes from Phase 1

| Concern | Phase 1 | Phase 2 |
|---|---|---|
| LLM serving | Ollama on CPU VM | vLLM on NVIDIA Spark |
| LLM model | Gemma 4 E2B (CPU, 4-bit) | Gemma 4 26B A4B MoE (GPU) — TBD after benchmarks |
| Embedding | SentenceTransformer (local, App VM CPU) | Embedding service on Spark (GPU) — KB config change only |
| Vector store | ChromaDB (local, App VM) | pgvector on Spark Postgres — KB config change only |
| LLM config change needed | — | None — set `llm_backend=custom`, `custom_base_url=http://<spark>/v1` |
| Embedding config change needed | — | None — set `embedding_backend=custom`, `embedding_custom_base_url=http://<spark>/v1` |
| Auth | Password-protected cookie | OIDC via Active Directory / Entra ID |
| Conversation history | Tied to cookie | Tied to AD identity — persists across devices |
| Conversation storage | Flat JSON files | Postgres (wiring exists in conversational-toolkit) |
| Ingestion | API-triggered, CPU | API-triggered, GPU-accelerated on Spark |
| User interfaces | RAG app only | RAG app + Open WebUI + optionally AnythingLLM |

### Spark memory budget — same as previous analysis

| Service | Approx. memory |
|---|---|
| Gemma 4 26B MoE — vLLM (bf16) | ~50 GB |
| Text embedding service (bge-m3) | ~2 GB |
| PostgreSQL + pgvector indexes | ~10–15 GB |
| OS overhead | ~5 GB |
| **Total** | **~67–72 GB** — ~56 GB headroom on the 128 GB Spark |

---

## Things to watch out for

### vLLM on the NVIDIA Spark (Grace Blackwell)

Same caveat as before: vLLM's ARM/Grace support is still maturing. Verify
compatibility before committing. llama.cpp server and HuggingFace TGI are
drop-in alternatives (both expose OpenAI-compatible APIs); this app's `custom`
backend points at either without code changes.

### Merge conflicts must be resolved first

The app won't start until the `<<<<<<< HEAD` markers in `main.py` and
`feature0_baseline_rag.py` are removed. In both files, the HEAD version is
correct — it's the version with the multi-KB, hybrid retrieval, and other
extensions. Discard the `upstream/main` sections.

### Incremental indexing still needs work

Adding a new document to an existing KB requires triggering a full `reset=True`
reindex to pick it up — the incremental path silently skips embedding if the
store is non-empty. This is the same issue as in the upstream; it should be
addressed before the knowledge base grows large enough that a full re-index
becomes slow.

### Ollama model download in a corporate network

Ollama downloads models from HuggingFace on first run. In a restricted corporate
network this will be blocked. Pre-download the model and serve from a local
path, or configure a local HuggingFace mirror with IT.

### SentenceTransformer model download

Same issue as above for the local embedding model. On first start,
`nomic-ai/nomic-embed-text-v1` is downloaded (~300 MB). Can be pre-cached or
served from an internal mirror by setting `HF_HUB_CACHE` and
`HF_HUB_OFFLINE=1`.

---

## Open questions for Phase 2

- Final LLM model — benchmark Gemma 4 26B A4B MoE vs 31B Dense on the Spark
- Single shared knowledge base or per-department isolation?
- Who triggers re-indexing when documents are updated — IT or knowledge owners?
- Should incremental indexing be added before Phase 1 (if the KB changes
  frequently) or can full resets be tolerated in the prototype?

## Resolved (from previous analysis)

- **Embedding backend** — fully configurable, no code changes needed for Phase 2
- **Remote vector store** — pgvector works out of the box; no ChromaDB HTTP mode needed
- **Ingestion pipeline** — API-triggered, no notebook dependency
- **Image embedding startup crash** — not an issue in this fork
- **OpenAI-compatible endpoint** — already present, Open WebUI connects directly
- **vLLM compatibility** — `custom` backend with `base_url` covers vLLM, no code changes
- **Auth** — Local Active Directory via AD FS (Phase 2); password cookie (Phase 1)
- **Data residency** — fully on-premises in both phases
