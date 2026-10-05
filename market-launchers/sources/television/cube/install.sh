#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source cube/runtime.sh
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm ci --no-audit --no-fund
npm run build
bash cube/agent-tools.sh
