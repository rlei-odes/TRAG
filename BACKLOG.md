# BACKLOG

Planned improvements and feature work for the TRAG fork.
Items are grouped by theme and roughly prioritised within each section.

---

## Known Bugs

### Answer Disappears After Rendering

Root cause identified and fixed: `mistral-nemo:12b` emits literal newlines inside JSON string values, which is invalid JSON. `partial_json_loads` failed silently, returning `{}`, so the extracted answer was empty and the streamed content disappeared when the DB record replaced the live display.

Fixes applied (v0.2.29):
- `_escape_literal_newlines()` pre-processes the JSON before parsing to handle bare newlines in string values
- `_answer_post_processing` falls back to the raw accumulated text if the `"answer"` key cannot be extracted, preventing silent data loss
- `parse_llm_json_stream` now catches all exceptions from `partial_json_loads`, not just `ValueError`

Monitor for recurrence. A better-instruction-following model (e.g. larger Ollama models) will reduce the frequency of format violations.

### Low Source Citation Count

Observed that answers sometimes cite only 2 chunks even when retrieval is configured with a higher `k`. Possible causes: the reranker is collapsing similar chunks into fewer sources, the `used_sources_id` field in the LLM JSON response is under-populated (model not citing all chunks it used), or the source deduplication step in `_answer_post_processing` is too aggressive. Needs investigation with logging enabled on retrieved chunk count vs. cited chunk count.

---

## Authentication & Access Control

### Admin / User Role Separation

Currently all authenticated users share a single password and have full access to the technical interface, including RAG configuration, reindexing, model selection, system prompt editing, and preset management.

**Goal:** introduce a two-tier access model so that end users only see the chat interface, while admins retain full configuration access.

**Scope:**
- Add an admin flag to the session (e.g. a separate admin password or a role field in the auth cookie)
- Hide the RAG Config panel from non-admin sessions
- Hide or lock: reindex buttons, model selectors, system prompt editor, embedding configuration, vector store settings, preset create/delete
- **Stop indexing button** (red, in the sidebar progress bar) — admin-only; end users should see the progress indicator but not be able to cancel a running indexing job
- End users retain: chat, conversation history, language toggle, theme toggle
- No per-user accounts required at this stage — two passwords (user / admin) is sufficient for the prototype
- **Fallback admin account** — a local admin credential (env var or config file) that works independently of SSO/AD, so the system is never locked out if the directory is unreachable; required before SSO integration is attempted

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

### Reindex Success Toast — UX Improvements

- ~~**Split skip counts**~~ ✓ done — `files_skipped_store` and `files_skipped_batch` now separate fields in `ReindexResult`; toast shows e.g. "38 already up to date, 1 duplicate in batch"
- ~~**Timestamp**~~ ✓ done — completion time appended to toast ("· 14:32")
- **Auto-dismiss vs. persistent:** left as-is for now — current behaviour is acceptable.

### Image Parsing in Documents

**Goal:** extract and index content from images embedded in PDFs and other documents (diagrams, scanned pages, figures with captions).

**Scope:**
- Investigate what the latest SDSC upstream changes add in this area — image parsing appears to be a focus of recent upstream work
- Review and merge relevant upstream changes after analysing the diff (see also: Upstream Sync below)
- Evaluate whether Docling's built-in image handling is sufficient or whether a dedicated vision model step is needed

**Why:** documents with diagrams, charts, or image-heavy layouts are currently only partially indexed — text around images is captured but image content itself is lost.

### File Upload API + Incremental Indexing

**Goal:** allow external tools (n8n, Make, custom scripts, DMS webhooks) to push a document directly into a KB via API, without requiring filesystem access or a full reindex.

**Scope:**
- `POST /api/v1/kb/{id}/documents` — accepts a file upload plus optional metadata (document_id, version, source system); writes it to the KB's data directory and queues it for indexing
- Requires incremental indexing to be solved first: currently `build_vector_store()` either resets fully or skips entirely — per-document content-hash deduplication must be in place for single-file ingest to be meaningful
- File upload endpoint should return a job ID that can be polled via the existing reindex-status endpoint
- Natural webhook target for DMS release/approval events — see Metadata & Versioning below

**Why:** closes the loop for automation use cases — the `/v1/chat/completions` endpoint already allows querying the RAG from external tools; this adds the ability to feed documents in from the same tools. Combined with metadata and versioning support, enables a fully automated DMS → RAG pipeline.

### External Metadata Ingestion & Document Versioning

**Context:** enterprise DMS solutions (SharePoint, Alfresco, OpenText, etc.) attach structured metadata to files — author, department, document type, validity date, status, project ID. This metadata is useful for retrieval attribution and filtering, but is not captured by the current file-based ingestion pipeline. A related problem is document replacement: when a new version or approved revision of a document is available, the old chunks in the vector store should be removed.

**Scope boundary — what TRAG does and does not own:**

DMS metadata models are complex and vary significantly between systems. A single DMS may distinguish between versions (any change) and revisions (approved changes), use different field names for status, and apply custom approval workflows. Building a UI for field mapping, version/revision logic interpretation, and status filtering inside TRAG would turn it into a DMS integration platform — that is out of scope.

**The responsibility split:**
- **Integration layer** (customer script, n8n, webhook): reads DMS metadata, applies any required filtering (e.g. only status=Released), maps DMS field names to TRAG's fixed schema, and delivers the file + metadata to TRAG
- **TRAG**: accepts the file and the pre-mapped metadata, stamps it onto chunks, and handles replacement using the `document_id` it is given

TRAG defines the schema; the integration layer handles the transformation. This keeps the ingestion code simple and avoids building a configurable ETL engine inside the RAG system.

**TRAG metadata schema:**

Sidecar file: `document.pdf.meta.json` alongside the file, or a JSON body field in the File Upload API request.

```json
{
  "document_id": "stable-uid-from-dms",
  "title": "Human-readable document title",
  "author": "Name or department",
  "document_class": "Technical",
  "document_type": "Specification",
  "document_created_at": "2024-01-15",
  "document_released_at": "2025-03-01",
  "source_url": "https://dms.example.com/documents/12345",
  "tags": ["project-x", "team-z"]
}
```

Only `document_id` is required for versioning. All other fields are optional and stored as chunk metadata. `document_released_at` serves as the version timestamp for stale-version detection. `document_class` is a category above `document_type` (e.g. Technical / Commercial / Legal / Internal) and is intended as a future retrieval filter — letting users scope answers to a specific document class.

`source_url` is an optional deep link back to the document in the originating DMS or file system. When present, source citations in the answer should link directly to this URL rather than opening the current local content popup. When absent, fall back to the existing behaviour (filename link → content popup). Implementation: the `source://` URL handler in the frontend Markdown renderer checks the chunk's stored metadata for `source_url` and opens it in a new tab if available; the backend already stores all metadata fields on each chunk so no ingestion-side changes are needed beyond reading the field.

**Document replacement (versioning):**

- `VectorStore.delete_chunks_by_document_id(document_id)` — new abstract method, implemented for ChromaDB (metadata filter delete) and pgvector (DELETE WHERE clause)
- Ingestion pipeline: when a file carries a `document_id` that already exists in the store, delete the old chunks before adding the new ones
- `ReindexResult` extended with `files_updated` count (replacements) alongside existing skip counts
- Reindex toast updated: N added / N updated / N skipped

**Stale version protection:**

The integration layer (webhook/script) is stateless — it cannot know whether a newer version of a document is already in the store. Two complementary mechanisms:

- `GET /api/v1/kb/{id}/documents/{document_id}` — returns the current metadata stored for that document_id (title, `document_released_at`, chunk count), or 404 if not present. The caller can compare `document_released_at` values and abort if the stored version is already newer.
- Optional version guard on the upload endpoint: accept an `if_released_after` parameter; if the stored `document_released_at` is equal to or newer, TRAG returns 409 Conflict with the stored metadata. This keeps the guard logic server-side and avoids requiring a pre-check round-trip.

**Document invalidation (explicit deletion):**

When a document is withdrawn or put out of validation in the DMS, the integration layer calls:

`DELETE /api/v1/kb/{id}/documents/{document_id}` — removes all chunks for that document_id from the vector store. Returns 404 if not found, 200 with a count of chunks removed otherwise.

This is the correct primitive for the "document no longer valid" use case. TRAG does not automatically expire documents based on timestamps — the DMS workflow owns that decision and calls the delete endpoint explicitly.

**What is explicitly out of scope for TRAG:**
- UI for selecting or mapping metadata fields from an uploaded sample JSON
- Interpretation of version vs. revision semantics (the integration layer decides what counts as a replacement)
- Status-based filtering at ingestion time (filter at the DMS export / webhook level)
- Automatic time-based expiry of documents based on metadata timestamps
- Direct DMS API or database connectivity (DMS-specific, belongs in the integration layer)

---

## Admin Tooling

### Retrieval Debugger — Chunk Inspector & Retrieval Probe

**Goal:** an admin-only UI panel that exposes the internals of the retrieval pipeline, allowing configuration tuning and quality assessment without going through the LLM.

**Why:** currently the only way to assess retrieval quality is to run a full RAG query and judge the answer. That conflates LLM quality with retrieval quality. A dedicated retrieval view lets you tune k, compare ranking methods, and inspect what was actually indexed — independently of the LLM.

**Two modes:**

*Chunk browser*
- Query the vector store directly by filename, source metadata, or keyword
- Display raw chunks: content, source file, chunk index, file hash, any other stored metadata
- Useful for verifying what was indexed from a given document and spotting bad chunking

*Retrieval probe*
- Enter a natural language question; run the full retrieval pipeline but stop before the LLM
- Display the top-k results as a ranked list with scores broken out by method:
  - BM25 score
  - Semantic (vector) score
  - RRF combined rank
- Allow adjusting k in the UI and seeing immediately how the result set changes
- Useful for: setting k, diagnosing why a relevant chunk isn't surfacing, comparing the effect of toggling BM25 on/off

**Backend:**

Add `POST /api/v1/rag/retrieve` — takes a query string and retrieval parameters (k, bm25 on/off, reranking on/off), runs the retrieval pipeline, and returns the chunks with per-method scores. No LLM call. The retrieval step is already decoupled from the LLM in the existing code, so this is mostly exposure work.

**Frontend:**

The admin view is a dedicated full-width page layout, not a panel crammed into the existing sidebar. Layout: large main content area on the left for the chunk browser / retrieval probe, with the existing RAG config sidebar sitting beside it on the right — same sidebar, different screen context with more room to breathe.

Two sub-views in the main area, selectable by toggle or tabs: chunk browser and retrieval probe.

*Retrieval probe results list:*

Each result is a card with a large rank number on the left (bold, prominent), then the chunk content and scores. The list shows **k + y** results total, where k is the current configured cutoff and y is a configurable lookahead (e.g. +5). The first k cards render normally; the remaining y cards are visually dimmed — lower opacity, maybe a subtle "outside k" label — so you can see exactly what the RAG would discard. This makes the effect of changing k immediately legible: raise k by 2 and two grayed cards become active.

**Scope note:** the UI cards are non-trivial but not complex — a ranked list with expandable text. Generic vector store UIs (ChromaDB-UI etc.) don't know about the BM25/RRF pipeline, so building this in-app is the only way to get the full picture.



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

## Security & Privacy

### Full Offline Mode

**Goal:** the system should be fully functional with no internet connection after initial setup (model downloads). All dependencies that phone home should have their update checks suppressed by default.

**Known issue:** SentenceTransformer (and potentially other services in the stack) makes outbound requests on every model load to check for updates, even when all assets are fully cached locally. With no internet this causes multi-second retry delays and noisy error logs before falling back to the cache. It also constitutes unnecessary telemetry to third-party services.

**Fix:** set an `TRAG_OFFLINE=1` environment variable in `start.sh` that maps to the relevant library-specific offline flags (e.g. `HF_HUB_OFFLINE=1` for the HuggingFace ecosystem). As other services are identified, their suppression flags are added under the same umbrella variable.

```bash
# in start.sh, before the backend launch:
TRAG_OFFLINE="${TRAG_OFFLINE:-1}" \
HF_HUB_OFFLINE="${TRAG_OFFLINE:-1}" \
PYTHONPATH="$REPO/backend/src" \
BACKEND=ollama \
  "$VENV/bin/python" -m sme_kt_zh_collaboration_rag.main ...
```

Also document in `local_setup.md` that after first run the system is designed to operate fully offline, what `TRAG_OFFLINE=1` suppresses, and how to temporarily disable it if a model update is actually wanted (`TRAG_OFFLINE=0 ./start.sh`).

### Network Egress Audit — What Phones Home?

**Goal:** produce a complete, verified list of all external network calls made by the system under normal operation, so that the deployment can be assessed for air-gap readiness and data privacy.

**Known calls (from observation):**
- `huggingface.co` — SentenceTransformer model update check on every `build_embedding_model()` call (fixable with `HF_HUB_OFFLINE=1`, see above)
- `ollama.com` — Ollama may check for binary or model updates; needs verification

**Unknown / to verify:**
- ChromaDB — any telemetry or update checks?
- Docling — any calls during document parsing?
- Any other Python dependencies that phone home on import or first use?

**Method:** run the backend with network access but with a local DNS proxy or `tcpdump` to capture all outbound DNS queries and HTTPS connections during startup, ingestion, and a query. Catalogue every external host contacted, the reason, and whether it can be suppressed.

**Output:** a documented list in `local_setup.md` (or a dedicated `SECURITY.md`) of all external hosts, what triggers the call, and how to suppress it for air-gapped or privacy-sensitive deployments.

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

## Appendix: Feature Specs

### Spec: Ingestion Deduplication

**Branch:** `feature/ingestion-deduplication`

---

#### Background

A draft PR was submitted to the upstream SDSC repo (SwissDataScienceCenter/sme-kt-zh-collaboration-rag#3) with an initial implementation. It was not merged. The reviewer's comments identified four concrete design problems that must be addressed in this implementation. This spec incorporates those learnings.

---

#### Problem Statement

The current `build_vector_store()` has an all-or-nothing guard: if the collection already contains any chunks, the entire embedding pass is skipped. If the collection is empty, all files are parsed and embedded without any check for duplicates within the batch.

This produces two failure modes:
1. The same file under two different filenames is embedded twice in a single run, creating duplicate chunks that dilute retrieval.
2. After a `reset=False` reindex that finds an existing collection, any new files added since the last index run are silently ignored.

---

#### Goals

- Skip parsing and embedding of files whose content is already in the vector store (cross-run deduplication).
- Skip parsing and embedding of files whose content has already been seen earlier in the same ingestion batch (within-run deduplication).
- Stamp every chunk with its source file's SHA-256 hash so that future runs can identify it regardless of filename.
- Keep the expensive file-parsing step (`load_chunks`) free of embedding-level concerns: hashing happens before parsing, not inside it.
- Surface skipped files clearly in the log.
- `reset=True` clears the store and bypasses cross-run deduplication; within-batch deduplication still applies.

---

#### Learnings from the Draft PR (SwissDataScienceCenter/sme-kt-zh-collaboration-rag#3)

The upstream reviewer (Thibaut-Loiseau) left six specific comments. The problems and their resolutions:

**1. `get_existing_hashes` took a `db_path` — wrong abstraction layer**

The draft passed a filesystem path to `get_existing_hashes`, then instantiated `ChromaDBVectorStore` inside the function. This hardcodes the ChromaDB backend and breaks if the vector store is PGVector or anything else.

Fix: add `get_file_hashes() -> set[str]` as an abstract method on the `VectorStore` base class. Each backend implements it. Call sites pass a `VectorStore` instance, not a path.

**2. `get_existing_hashes` accessed `vs.collection` directly**

The draft reached into `.collection`, a ChromaDB-specific property, from what was supposed to be a backend-agnostic utility function. Acceptable in a notebook; not in production code.

Fix: the logic for querying metadata lives inside the `ChromaDBVectorStore.get_file_hashes()` implementation, not in any shared utility.

**3. `seen_hashes.add(hash_value)` was called before the `try/except` block**

If processing the first occurrence of a duplicate file raises an exception, the hash was already registered as seen. The second occurrence would then be silently skipped — neither copy would end up in the store.

Fix: only call `seen_hashes.add(hash_value)` after the file has been successfully parsed and its chunks collected.

**4. The `"unknown"` fallback in `build_vector_store` was unsafe**

The draft used `chunk.metadata.get("file_hash", "unknown")` when grouping chunks. If more than one chunk lacked a `file_hash` key, they would all fall into a single `"unknown"` bucket and only the first group would be ingested.

Fix: `file_hash` must always be present in chunk metadata — it is stamped by `load_chunks` before any chunk is returned. If it is somehow missing at the `build_vector_store` stage, raise an error rather than silently grouping under a sentinel.

**5. Don't filter inside `load_chunks`**

The draft added `existing_hashes` filtering logic to `load_chunks`. The reviewer's position: `load_chunks` reads files; it should not need to know about what is already in the store.

Resolution for this spec: pre-compute existing hashes from the vector store in `_run_ingestion` (in `main.py`), build the set of files to skip before calling `load_chunks`, and pass only the list of non-skipped files in. `load_chunks` itself remains unaware of the store. The within-batch deduplication (seen_hashes) lives in the pre-pass, not inside load_chunks.

**6. Do not commit test fixture files for duplicate detection**

The draft committed `data/EVALUATION_duplicate_file.pdf`. Testing for duplicates should reuse an already-present file — point the KB at a directory where the same file appears twice under different names (or copy one), test, then clean up.

---

#### Design

**New abstract method on `VectorStore`:**

```python
# conversational-toolkit/src/conversational_toolkit/vectorstores/base.py
@abstractmethod
async def get_file_hashes(self) -> set[str]:
    """Return the set of file_hash values stored in this collection's metadata."""
    ...
```

**`ChromaDBVectorStore.get_file_hashes()` implementation:**

Follow the same pattern as `get_source_files()` — wrap the synchronous ChromaDB call in `run_in_executor`:

```python
async def get_file_hashes(self) -> set[str]:
    import asyncio
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None, lambda: self.collection.get(include=["metadatas"])
    )
    return {m["file_hash"] for m in (result.get("metadatas") or []) if m and "file_hash" in m}
```

**`PGVectorStore.get_file_hashes()` implementation:**

The metadata is stored in the `chunk_metadata` JSON column. The pattern is identical to the existing `get_source_files()` method — same SQLAlchemy accessor, different key:

```python
async def get_file_hashes(self) -> set[str]:
    await self._ensure_initialized()
    async with self.SessionLocal() as session:
        result = await session.execute(
            select(self.table.c.chunk_metadata["file_hash"].astext)
            .distinct()
            .where(self.table.c.chunk_metadata["file_hash"].astext.isnot(None))
        )
        return {row[0] for row in result if row[0]}
```

**New helper `file_hash()` in `feature0_baseline_rag.py`:**

```python
def file_hash(path: Path) -> str:
    """SHA-256 fingerprint of a file's raw bytes."""
    return hashlib.sha256(path.read_bytes()).hexdigest()
```

**`load_chunks` signature change:**

Add two new optional parameters:

```python
def load_chunks(
    data_dirs: list[Path] | None = None,
    ...
    include_files: list[Path] | None = None,       # if set, skip data_dirs iteration
    file_hashes: dict[Path, str] | None = None,    # precomputed hashes for stamping
) -> list[Chunk]:
```

When `include_files` is provided, the function iterates that list instead of scanning `data_dirs`. This allows the pre-pass to pass only files that survived deduplication. `file_hashes` is used to stamp `chunk.metadata["file_hash"]` for each file; if a file's hash is not in the dict, compute it on the fly as a fallback (notebook compatibility).

**Extract `_collect_candidate_files()` helper from `load_chunks`:**

The pre-pass needs to know which files exist and pass filtering (extension, size, "EVALUATION" exclusion) before it can hash them. This logic currently lives inside `load_chunks`. Rather than duplicating it, extract it into a shared helper:

```python
def _collect_candidate_files(
    data_dirs: list[Path],
    max_file_size_mb: float,
    max_files: int | None = None,
) -> list[Path]:
    """Return the filtered list of ingestable files from the given directories."""
    ...
```

`load_chunks` calls this helper when `include_files` is not provided. The pre-pass calls it directly.

**Pre-pass in `_run_ingestion` (main.py), before `load_chunks`:**

File hashing reads entire files from disk — blocking I/O. Per the CLAUDE.md constraint, all blocking operations must use `run_in_executor`. The pre-pass runs in the executor, producing two outputs: the filtered file list and the precomputed hash map.

Steps (all inside a single `run_in_executor` call, before the existing `load_chunks` executor call):

1. Call `_collect_candidate_files(data_dirs, ...)` to get candidate files.
2. For each file, compute `file_hash(path)` → build `file_hashes: dict[Path, str]`.
3. Apply cross-run dedup: filter out files whose hash is in `existing_hashes`, log and count each skip.
4. Apply within-batch dedup: from the remainder, build `seen_hashes`, skip files whose hash is already seen (only add to `seen_hashes` after the file passes), log and count each skip.
5. Return `(filtered_files, file_hashes, n_skipped_store, n_skipped_batch)`.

`existing_hashes` is obtained by `await vector_store.get_file_hashes()` before the executor call. To do this without blocking the event loop, the VS must be queryable from the async context:

- **ChromaDB**: `ChromaDBVectorStore.get_file_hashes()` wraps in `run_in_executor` internally (consistent with `get_source_files()`), so awaiting it from the async context is correct. `make_vector_store` can be called synchronously in the async context; the same instance is passed to `_sync_build_vs`.
- **PGVector**: `AsyncEngine` is bound to the event loop it was created in and cannot be reused in `_sync_build_vs`'s separate loop. Create two separate `PGVectorStore` instances: one in the async context for the hash query, one inside `_sync_build_vs` for embedding (as today).

**`_run_ingestion` return type:**

Change from `tuple[int, int]` to `tuple[int, int, int]` — adding `files_skipped`. Update the call site at line 598:
```python
chunks_n, files_n, skipped_n = await _run_ingestion(kb, reset)
```
And the `ReindexResult` construction:
```python
return ReindexResult(chunks_indexed=chunks_n, files_processed=files_n, files_skipped=skipped_n, reset=reset)
```
`update_stats` (line 599) is unchanged — it receives only `chunks_n` and `files_n` (files actually indexed, not skipped).

**In `build_vector_store`:**

- Remove the `current_count > 0` early-exit guard (it was the root cause of new files being silently ignored on incremental runs).
- Accept an optional `existing_hashes: set[str] | None = None` parameter. When provided (passed from the pre-pass), use it directly — do not call `get_file_hashes()` again. When `None` (notebook/standalone call), call `get_file_hashes()` internally. This prevents loading all chunk metadata twice per reindex run.
- Group incoming chunks by `file_hash`. Raise `ValueError` if any chunk is missing `file_hash` in its metadata.
- For each group, check whether the hash is in `existing_hashes`. If yes, log and skip. If no, embed and insert.

**`ReindexResult` and UI:**

Add `files_skipped: int = 0` to `ReindexResult` in `rag_router.py`. Populate it from the pre-pass counts. Update the `statusIndexed` string in all four language files (`en.ts`, `de.ts`, `fr.ts`, `it.ts`) to surface the skipped count when non-zero. Example:

```
# when skipped > 0
"Indexed {{chunks}} chunks from {{new}} files ({{skipped}} already up to date)."
# when skipped == 0
"Indexed {{chunks}} chunks from {{files}} files."
```

The frontend `reindex()` function in `rag-config-panel.tsx` already reads `data.files_processed` — it will also read `data.files_skipped` and pick the appropriate string.

**Logging:**

- Each cross-run skip: `INFO "Skipping {filename!r} — already in store (hash={hash[:8]}…)"`
- Each within-batch skip: `WARNING "Skipping {filename!r} — duplicate content in current batch (hash={hash[:8]}…)"`
- Summary at end: `INFO "Ingestion complete: {new} new files embedded, {skipped_store} skipped (already in store), {skipped_batch} skipped (duplicate in batch)"`

---

#### Scaling Considerations

These are known limitations at 10k+ documents. None block this feature's correctness at current scale; they are noted here to avoid designing into a corner.

**`collection.get(include=["metadatas"])` does not scale (ChromaDB).**
`get_file_hashes()` fetches metadata for every chunk in the collection — no pagination, no filtering, no distinct. At 200k chunks this loads hundreds of MB of Python dicts into memory and takes seconds. The existing `get_source_files()` has the same problem. The long-term fix is a separate per-file hash registry (e.g., a small SQLite or JSON file alongside the vector store) that stores one record per file rather than deriving state from chunk metadata. That is a follow-up task.

**Hashing all files on every run.**
`file_hash()` reads the entire file to compute SHA-256. At 10k × 5MB average that is 50 GB of disk reads per run, even when 9,990 files have not changed. The fix is a mtime + size fast-path: if both are unchanged since the file was last indexed, skip the SHA-256 read entirely. This requires the per-file registry above and is a follow-up.

**Old collections have no `file_hash` metadata.**
KBs indexed before this feature was deployed will have no `file_hash` in their chunk metadata. `get_file_hashes()` will return an empty set, and the first incremental reindex will re-embed everything. This is correct behaviour (not a bug) but may surprise users. Log a warning when the store is non-empty but `get_file_hashes()` returns an empty set.

**BM25 in-memory corpus (pre-existing, not introduced by dedup).**
`BM25Retriever` calls `get_chunks_by_filter()` with no filter on the first query after a reindex, loading all chunks including full text content into memory, then tokenising them to build the index. At 200k chunks this takes many seconds and several GB of RAM. It happens on the first user query, not during reindex. Dedup helps indirectly by preventing duplicate chunks from inflating the corpus, but does not solve the underlying problem.

---

#### What Does Not Change

- `reset=True` wipes the collection and skips cross-run deduplication (nothing in the store to compare against). Within-batch deduplication still applies — two files with identical content in the same batch still produce only one set of chunks.
- The BM25 index is rebuilt from scratch on every reindex (lazy init in `BM25Retriever`), so no explicit invalidation is needed.
- No new dependencies.

---

#### Out of Scope for This Feature

- Removal of chunks belonging to a file that has been deleted from disk (orphan cleanup).
- A force-reingest flag for individual files.
- UI display of per-file dedup status (only counts, not per-file breakdown).

These are deferred to a follow-up once the core deduplication is stable.

---

