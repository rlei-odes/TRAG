#!/bin/bash
# voninsight-TRAG — Start backend + frontend
set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$REPO/logs"
VENV="$REPO/.venv"

mkdir -p "$LOG_DIR"

# --- Ollama check ---
OLLAMA_HOST="${OLLAMA_HOST:-localhost:11434}"
if curl -sf "http://$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
    echo "Ollama is running at $OLLAMA_HOST"

    # Check if the configured LLM model is pulled
    LLM_MODEL=$(python3 -c "import json; d=json.load(open('$REPO/backend/src/sme_kt_zh_collaboration_rag/db/rag_config.json')); print(d.get('llm_model',''))" 2>/dev/null)
    if [ -n "$LLM_MODEL" ]; then
        if curl -sf "http://$OLLAMA_HOST/api/tags" | grep -q "\"$LLM_MODEL\""; then
            echo "  Model '$LLM_MODEL' is available"
        else
            echo "⚠️  Model '$LLM_MODEL' is not pulled yet"
            echo "   Run: ollama pull $LLM_MODEL"
            echo "   The backend will start but LLM calls will fail until the model is available."
            echo ""
        fi
    fi
else
    echo "⚠️  Warning: Ollama does not appear to be running at $OLLAMA_HOST"
    echo "   Start it with: ollama serve"
    echo "   The backend will start but LLM calls will fail until Ollama is available."
    echo ""
fi

# --- Backend ---
echo "Starting backend (Ollama / mistral-nemo:12b) on port 8080..."
PYTHONPATH="$REPO/backend/src" \
BACKEND=ollama \
  "$VENV/bin/python" -m sme_kt_zh_collaboration_rag.main \
  > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"
echo "  Backend PID: $(cat $LOG_DIR/backend.pid)"

# --- Frontend ---
echo "Starting frontend on port 3000..."
cd "$REPO/frontend" && npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"
echo "  Frontend PID: $(cat $LOG_DIR/frontend.pid)"

echo ""
echo "voninsight-TRAG is running:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8080"
echo ""
echo "Logs: $LOG_DIR/"
echo "Stop: ./stop.sh"
