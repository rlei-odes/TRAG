# BACKLOG

Planned improvements and feature work for the TRAG fork.
Items are grouped by theme and roughly prioritised within each section.

---

## Authentication & Access Control

### Admin / User Role Separation

Currently all authenticated users share a single password and have full access to the technical interface, including RAG configuration, reindexing, model selection, system prompt editing, and preset management.

**Goal:** introduce a two-tier access model so that end users only see the chat interface, while admins retain full configuration access.

**Scope:**
- Add an admin flag to the session (e.g. a separate admin password or a role field in the auth cookie)
- Hide the RAG Config panel from non-admin sessions
- Hide or lock: reindex buttons, model selectors, system prompt editor, embedding configuration, vector store settings, preset create/delete
- End users retain: chat, conversation history, language toggle, theme toggle
- No per-user accounts required at this stage — two passwords (user / admin) is sufficient for the prototype

**Why:** prototype rollout to a small trusted team is fine without this, but broader internal use requires that non-technical users cannot accidentally break the configuration or trigger a full reindex.

### Active Directory / SSO Integration

**Goal:** optional AD/SSO login as an alternative to the shared-password model, for organisations that manage users centrally.

**Scope:**
- LDAP / Active Directory bind for authentication
- Map AD groups to roles (e.g. domain users → user role, IT group → admin role)
- Feature should be opt-in and deactivatable — shared-password mode remains the default for simpler deployments
- Builds naturally on top of the admin/user role separation above

**Why:** relevant for enterprise rollout where user management via AD is already in place and individual password distribution is impractical.

---

## Ingestion

### Image Parsing in Documents

**Goal:** extract and index content from images embedded in PDFs and other documents (diagrams, scanned pages, figures with captions).

**Scope:**
- Investigate what the latest SDSC upstream changes add in this area — image parsing appears to be a focus of recent upstream work
- Review and merge relevant upstream changes after analysing the diff (see also: Upstream Sync below)
- Evaluate whether Docling's built-in image handling is sufficient or whether a dedicated vision model step is needed

**Why:** documents with diagrams, charts, or image-heavy layouts are currently only partially indexed — text around images is captured but image content itself is lost.

### File Upload API + Incremental Indexing

**Goal:** allow external tools (n8n, Make, custom scripts) to push a document directly into a KB via API, without requiring filesystem access or a full reindex.

**Scope:**
- `POST /api/v1/kb/{id}/documents` — accepts a file upload, writes it to the KB's data directory, and queues it for indexing
- Requires incremental indexing to be solved first: currently `build_vector_store()` either resets fully or skips entirely — per-document content-hash deduplication must be in place for single-file ingest to be meaningful
- File upload endpoint should return a job ID that can be polled via the existing reindex-status endpoint

**Why:** closes the loop for automation use cases — the `/v1/chat/completions` endpoint already allows querying the RAG from external tools; this adds the ability to feed documents in from the same tools. Also resolves the known issue of incremental indexing.

### Ingestion Deduplication

**Goal:** skip documents during indexing that have already been ingested, even if they appear under a different filename.

**Scope:**
- Compute a content hash (e.g. SHA-256) of each document at ingest time and store it alongside the chunks
- On subsequent index runs, compare incoming file hashes against stored hashes and skip duplicates
- Surface skipped files in the indexing progress log and UI
- Handle the edge case where a document is intentionally updated under a new name (option to force re-ingest)

**Why:** in practice the same document often circulates under multiple filenames. Without deduplication, the vector store accumulates redundant chunks that dilute retrieval quality and waste storage.

### Customisable Retrieval Prompts

The query expansion, HyDE, and reranking prompts are currently hardcoded in Python. Unlike the system prompt (answer tone/format), these affect retrieval quality and could benefit from domain-specific tuning.

**Candidates:**
- **Query expansion** (`utils/retriever.py`) — could guide rephrasing toward domain vocabulary (e.g. industry terminology, local acronyms)
- **HyDE** (`utils/retriever.py`) — hypothetical document generation; domain context improves embedding match quality
- **LLM reranking** (`retriever/reranking_retriever.py`) — could define what "relevant" means for the specific corpus (e.g. prioritise verified sources over marketing material)

**Scope:** same file-based pattern as the system prompt — `prompts/query_expansion.default.md`, `prompts/hyde.default.md`, `prompts/reranking.default.md`, each with a gitignored `.custom.md` override. Admin-only UI exposure makes sense given the technical nature.

**Why:** hardcoded prompts cannot be tuned without touching source code; domain-specific guidance measurably improves retrieval recall and precision.

---

## Integrations

### Workflows Sidebar — Webhook Configuration

**Goal:** make the workflows sidebar panel useful by wiring it up to configurable webhook URLs.

**Scope:**
- Currently `WORKFLOWS = []` in `frontend/src/components/sections/sidebar/workflows.tsx` — entries are hardcoded
- Options: expose via environment variable, a `workflows.json` config file (gitignored, with a `.example`), or an admin UI panel
- n8n and Make are the most relevant targets for the planned deployment

**Why:** enables users to trigger external automations (create a ticket, save to Notion, forward to a colleague) directly from a RAG conversation without leaving the UI.

---

## Upstream Sync

### Analyse and Merge Latest SDSC Changes

**Goal:** review what has changed in the upstream SDSC repository since our fork diverged and selectively merge relevant improvements.

**Scope:**
- Diff upstream `main` against our fork baseline
- Identify new features, bug fixes, and notebook updates
- Image parsing support appears to be a key upstream addition — coordinate with the image parsing backlog item above
- Resolve any new merge conflicts carefully, preserving our fork's changes (keepalive streaming, metadata provider, etc.)

**Why:** staying reasonably in sync with upstream ensures we benefit from SDSC's ongoing work without the diff growing unmanageable over time.

---

