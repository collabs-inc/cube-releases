#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
case "${PORT:-}" in ''|*[!0-9]*) echo 'PORT must be an integer.' >&2; exit 1 ;; esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || { echo 'PORT is out of range.' >&2; exit 1; }
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=linux-x64 ;;
  Linux-aarch64|Linux-arm64) target=linux-arm64 ;;
  Darwin-arm64) target=macos-arm64 ;;
  Darwin-x86_64) target=macos-x64 ;;
  *) echo 'Unsupported Kandev platform.' >&2; exit 1 ;;
esac
export KANDEV_VERSION=0.97.0
export KANDEV_BUNDLE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/cube-kandev/$KANDEV_VERSION-$target"
export KANDEV_HOME_DIR="${CUBE_KANDEV_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/cube-kandev}"
export KANDEV_SERVER_HOST=127.0.0.1
export KANDEV_SERVER_PORT="$PORT"
# Cube's authenticated gate supplies access control. Keep the upstream single-user mode.
export KANDEV_FEATURES_AUTH=false
export PATH="$HOME/.local/bin:$PATH"
umask 077
mkdir -p "$KANDEV_HOME_DIR"
cd "$KANDEV_HOME_DIR"
# The native launcher requires --port; SERVER_PORT alone is only a child handoff.
exec node "$script_dir/supervise.mjs" "$KANDEV_BUNDLE_DIR/bin/kandev" --headless --port "$PORT"
