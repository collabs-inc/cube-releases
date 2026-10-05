#!/bin/sh
set -eu
cube_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cache="${CUBE_PAPERCLIP_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/cube-paperclip}"
runtime="$cache/2026.1001.0-1"
mkdir -p "$cache" "$runtime"
sh "$cube_dir/install-node.sh" "$cache"
export PATH="$cache/node-24.21.0/bin:$PATH"
if [ ! -f "$runtime/.installed" ]; then
  cp "$cube_dir/package.json" "$cube_dir/package-lock.json" "$runtime/"
  (cd "$runtime" && npm ci --omit=dev --no-audit --no-fund)
  test -f "$runtime/node_modules/@paperclipai/server/dist/index.js"
  node "$cube_dir/patch-runtime.mjs" "$runtime"
  touch "$runtime/.installed"
fi
echo 'Paperclip runtime installed.'
