# Local Setup Guide

## Prerequisites

**1. Install Node.js** (needed for the frontend):

nvm (Node Version Manager) installs Node.js entirely inside your home directory — no `sudo`, no system packages touched, trivially uninstalled. The Ubuntu repos ship an outdated Node version; nvm gives you a current one.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc   # or ~/.zshrc
nvm install 22
```

**2. Install Ollama**:
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**3. Pull a model** — on 32 GB with passive cooling, `mistral-nemo:12b` is the existing default and works well:
```bash
ollama pull mistral-nemo:12b
# Lighter alternative (~4 GB, faster startup):
# ollama pull gemma3:4b
```

---

## Backend

```bash
cd /home/roger/Documents/DEV/voninsight-TRAG

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

# Put some documents to index
mkdir -p data   # drop PDFs / DOCX / MD files here

# Start the backend (default model: mistral-nemo:12b)
BACKEND=ollama python -m sme_kt_zh_collaboration_rag.main
# → runs on http://localhost:8080

# Or use the lighter gemma3:4b model (~4 GB, faster startup):
# BACKEND=ollama LLM_MODEL=gemma3:4b python -m sme_kt_zh_collaboration_rag.main

# Note: on subsequent runs the model is read from db/rag_config.json (saved by the UI),
# not from the env var. Change it in the RAG Config panel if needed.
```

---

## Frontend

In a second terminal (venv not needed for the frontend):

```bash
cd /home/roger/Documents/DEV/voninsight-TRAG/frontend

npm install
npm run dev
# → http://localhost:3000
```

---

## Login

The password is set in `frontend/.env` as `API_KEY`. Currently it's `12345678` — change it to whatever you want.

Open http://localhost:3000, enter the password, and you're in.

---

## First use — indexing documents

1. Drop files (PDF, DOCX, EPUB, MD, XLSX) into `data/`
2. The backend auto-indexes on startup if the vector store is empty
3. Or trigger manually from the UI: RAG Config panel → **Reindex**

---

## Notes for your hardware

- **SentenceTransformer** downloads `nomic-ai/nomic-embed-text-v1` (~300 MB) on first run — needs internet once, then fully offline
- **Ollama** downloads the model on first `ollama pull` — also needs internet once
- With 32 GB RAM and `mistral-nemo:12b`, expect **2–5 tokens/sec** — usable, just not instant
- For faster responses at the cost of some quality: `ollama pull gemma3:4b` and start with `LLM_MODEL=gemma3:4b` (see backend command above), or switch it in the RAG Config panel in the UI after startup

---

## What lives where

### System-wide (outside the project)

| What | Where it lands | Notes |
|---|---|---|
| **nvm** | `~/.nvm/` | Node version manager |
| **Node.js** | `~/.nvm/versions/node/…` | Managed by nvm, not in `/usr/` |
| **Ollama** binary | `/usr/local/bin/ollama` | Installed by the curl script |
| **Ollama models** | `~/.ollama/models/` | `mistral-nemo:12b` ≈ 7 GB here |
| **HuggingFace model cache** | `~/.cache/huggingface/` | SentenceTransformer downloads `nomic-embed-text` (~300 MB) here on first run |

Python 3 itself is already on your system — nothing added there.

### Inside the project (safe to delete with the folder)

| What | Where |
|---|---|
| Python virtualenv | `voninsight-TRAG/.venv/` |
| All Python dependencies | `voninsight-TRAG/.venv/lib/…` |
| Frontend packages | `voninsight-TRAG/frontend/node_modules/` |
| Vector store (ChromaDB) | `voninsight-TRAG/backend/src/sme_kt_zh_collaboration_rag/db/` |
| Conversation history (JSON) | same `db/` folder |
| Documents you indexed | `voninsight-TRAG/data/` |

---

## To uninstall everything

**Project itself** — just delete the folder:
```bash
rm -rf /home/roger/Documents/DEV/voninsight-TRAG
```
That removes the venv, node_modules, vector store, and all data in one shot.

**Ollama** (binary + all models):
```bash
sudo rm /usr/local/bin/ollama
rm -rf ~/.ollama
```

**HuggingFace model cache** (the SentenceTransformer model):
```bash
rm -rf ~/.cache/huggingface
```

**Node.js + nvm**:
```bash
rm -rf ~/.nvm
```
Then remove these lines from `~/.bashrc` (or `~/.zshrc`):
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

Nothing outside those locations is touched. No system Python packages, no `/usr/lib` changes, no system services left running (Ollama runs as a background process but has no systemd unit unless you add one).
