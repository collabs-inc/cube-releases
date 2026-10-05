#!/bin/sh
set -eu
cube_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cache="${CUBE_PAPERCLIP_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/cube-paperclip}"
export PATH="$cache/node-24.21.0/bin:$HOME/.local/bin:$PATH"
exec "$cache/node-24.21.0/bin/node" "$cube_dir/start.mjs"
