#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then echo "Run this script on an Apple Silicon Mac (arm64)."; exit 2; fi
cd "$(dirname "$0")/.."
./scripts/vendor-engine.sh
npm install
npm run check
npm run build:mac
