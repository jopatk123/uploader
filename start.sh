#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_PORT=5173
BACKEND_PORT=3001

cd "$PROJECT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm not found. Install it first: npm install -g pnpm" >&2
  exit 1
fi

echo "==> Cleaning up old development server processes..."

kill_port() {
  local port="$1" pids
  pids="$(lsof -ti ":$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    # 先尝试优雅退出，超时后强制杀掉
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -ti ":$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      kill -9 $pids 2>/dev/null || true
    fi
    echo "    Killed process on port $port"
  fi
}

kill_port "$FRONTEND_PORT"
kill_port "$BACKEND_PORT"

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies..."
  pnpm install
fi

echo "==> Starting development server..."
exec pnpm run dev
