# Contributors

This project was initiated and developed by the [Swiss Data Science Center (SDSC)](https://datascience.ch),
ETH Zürich / EPFL.

## Major contributions

**Vonlanthen INSIGHT** — Patrik Vonlanthen (https://www.vonlanthen.tv)

- Multi-knowledge-base architecture (KB registry, hot-swap without restart)
- pgvector backend alongside ChromaDB (per-KB vector store selector)
- Hybrid retrieval: BM25 + semantic vector search via Reciprocal Rank Fusion (RRF)
- Query expansion, HyDE (Hypothetical Document Embeddings), LLM reranking
- Async refactoring: non-blocking SentenceTransformer, ChromaDB, BM25 (run_in_executor)
- Critical bug fix: stream sentinel in controller.py (AttributeError on response end)
- MarkItDown chunker: EPUB, DOCX, DOC support
- Generation statistics: query duration, tokens/second, model name
- OpenAI-compatible endpoint (/v1/chat/completions, /v1/models)
- RAG config panel: collapsible right-side panel with presets
- Login / passcode authentication
- Conversation grouping by date and session label
