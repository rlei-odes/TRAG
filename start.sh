#!/bin/bash
# INSIGHT Contrib — Demo Start
# Backend Port 8081, Frontend Port 3001

REPO="/home/patrik/insight-contrib"
CONDA_PYTHON="/home/patrik/miniconda3/envs/rag-venv/bin/python"
LOG_DIR="$REPO/logs"

mkdir -p "$LOG_DIR"

# Backend
echo "Starting contrib backend on port 8081..."
PYTHONPATH="$REPO/backend/src" \
PORT=8081 \
LITELLM_BASE_URL="https://l.one.i234.me" \
LITELLM_API_KEY="$(grep LITELLM_API_KEY /home/patrik/.config/systemd/user/insight-backend.service | cut -d= -f3)" \
ALLOW_ORIGINS="*" \
  $CONDA_PYTHON -m sme_kt_zh_collaboration_rag.main \
  > "$LOG_DIR/backend.log" 2>&1 &

echo $! > "$LOG_DIR/backend.pid"
echo "Backend PID: $(cat $LOG_DIR/backend.pid)"

# Frontend
echo "Starting contrib frontend on port 3001..."
cd "$REPO/frontend" && npm run dev -- -p 3001 > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"
echo "Frontend PID: $(cat $LOG_DIR/frontend.pid)"

echo ""
echo "Contrib Demo läuft:"
echo "  Frontend: http://192.168.1.65:3001"
echo "  Backend:  http://192.168.1.65:8081"
echo ""
echo "Stoppen: ./stop.sh"
