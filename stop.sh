#!/bin/bash
# INSIGHT Contrib — Demo Stop

LOG_DIR="/home/patrik/insight-contrib/logs"

if [ -f "$LOG_DIR/backend.pid" ]; then
    kill $(cat "$LOG_DIR/backend.pid") 2>/dev/null && echo "Backend gestoppt" || echo "Backend war bereits gestoppt"
    rm "$LOG_DIR/backend.pid"
fi

if [ -f "$LOG_DIR/frontend.pid" ]; then
    kill $(cat "$LOG_DIR/frontend.pid") 2>/dev/null && echo "Frontend gestoppt" || echo "Frontend war bereits gestoppt"
    rm "$LOG_DIR/frontend.pid"
fi

# Port freigeben
fuser -k 8081/tcp 2>/dev/null
fuser -k 3001/tcp 2>/dev/null
echo "Fertig."
