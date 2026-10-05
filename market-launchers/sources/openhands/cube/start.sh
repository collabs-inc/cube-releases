#!/bin/sh
set -eu
cube_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cache="${CUBE_OPENHANDS_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/cube-openhands}"
export PATH="$cache/node-24.21.0/bin:$cache/1.24.0-2/bin:$HOME/.local/bin:$PATH"
export UV_CACHE_DIR="$cache/1.24.0-2/uv-cache" UV_PYTHON_INSTALL_DIR="$cache/1.24.0-2/python"
export UV_PYTHON=3.12 UV_PYTHON_PREFERENCE=only-managed
exec "$cache/node-24.21.0/bin/node" "$cube_dir/start.mjs"
