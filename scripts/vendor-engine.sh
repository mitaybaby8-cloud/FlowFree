#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/vendor"
rm -rf "$ROOT/vendor/google-flow-mcp"
git clone --depth 1 https://github.com/miyakejima/google-flow-mcp.git "$ROOT/vendor/google-flow-mcp"
cd "$ROOT/vendor/google-flow-mcp"
npm ci
npm run check
npm run build
printf '\nEngine ready: %s\n' "$ROOT/vendor/google-flow-mcp/dist/index.js"
