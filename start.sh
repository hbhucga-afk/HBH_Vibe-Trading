#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  kill $MARKET_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  wait $MARKET_PID 2>/dev/null
  wait $FRONTEND_PID 2>/dev/null
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Vibe-Trading 一键启动${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# --- market data server ---
echo -e "${YELLOW}[1/2] Starting market data server (port 5001)...${NC}"
cd "$ROOT"
pip install -q flask flask-cors requests 2>/dev/null
python market_server.py &
MARKET_PID=$!
sleep 2

if ! kill -0 $MARKET_PID 2>/dev/null; then
  echo "ERROR: Market server failed to start"
  exit 1
fi
echo -e "${GREEN}  -> Market server PID $MARKET_PID${NC}"

# --- frontend ---
echo -e "${YELLOW}[2/2] Starting frontend dev server (port 5899)...${NC}"
cd "$ROOT/frontend"
npx vite --host 0.0.0.0 --port 5899 &
FRONTEND_PID=$!
sleep 3

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services running!${NC}"
echo -e "${GREEN}  Frontend : http://localhost:5899${NC}"
echo -e "${GREEN}  Market API: http://localhost:5001${NC}"
echo -e "${GREEN}  Press Ctrl+C to stop${NC}"
echo -e "${GREEN}========================================${NC}"

wait
