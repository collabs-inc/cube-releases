#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source cube/runtime.sh
: "${PORT:?Cube must supply PORT}"
export DO_NOT_TRACK=1
# Cube authenticates the viewer. The upstream server stays loopback-only.
# Use a separate persistent home so an independent Television install is untouched.
tv_home="${XDG_DATA_HOME:-$HOME/.local/share}/cube-television"
node packages/cli/dist/cli.cjs --home "$tv_home" config set port "$PORT" listen "" auth false
exec node packages/cli/dist/cli.cjs --home "$tv_home" serve
