#!/bin/sh
set -eu
cube_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cache="${CUBE_OPENHANDS_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/cube-openhands}"
runtime="$cache/1.24.0-2"
mkdir -p "$cache" "$runtime"
sh "$cube_dir/install-node.sh" "$cache"
export PATH="$cache/node-24.21.0/bin:$runtime/bin:$PATH"
export UV_CACHE_DIR="$runtime/uv-cache" UV_PYTHON_INSTALL_DIR="$runtime/python"
export UV_PYTHON=3.12 UV_PYTHON_PREFERENCE=only-managed
if [ ! -f "$runtime/.installed" ]; then
  cp "$cube_dir/package.json" "$cube_dir/package-lock.json" "$runtime/"
  (cd "$runtime" && npm ci --omit=dev --no-audit --no-fund)
  node "$cube_dir/patch-runtime.mjs" "$runtime"
  sh "$cube_dir/install-tmux.sh" "$runtime"
  case "$(uname -s)/$(uname -m)" in
    Linux/x86_64) target=x86_64-unknown-linux-gnu;;
    Linux/aarch64) target=aarch64-unknown-linux-gnu;;
    Darwin/arm64) target=aarch64-apple-darwin;;
    Darwin/x86_64) target=x86_64-apple-darwin;;
    *) echo 'Unsupported platform' >&2; exit 1;;
  esac
  archive="uv-$target.tar.gz"
  tmp=$(mktemp -d "$runtime/uv-download.XXXXXX")
  trap 'rm -rf "$tmp"' EXIT HUP INT TERM
  curl -fsSL --retry 3 "https://github.com/astral-sh/uv/releases/download/0.12.23/$archive" -o "$tmp/$archive"
  curl -fsSL --retry 3 "https://github.com/astral-sh/uv/releases/download/0.12.23/$archive.sha256" -o "$tmp/sum"
  expected=$(awk '{print $1}' "$tmp/sum")
  actual=$(node -e 'const fs=require("node:fs"),c=require("node:crypto");console.log(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$tmp/$archive")
  test "$expected" = "$actual"
  mkdir -p "$runtime/bin"
  tar -xzf "$tmp/$archive" -C "$runtime/bin" --strip-components=1
  rm -rf "$tmp"
  trap - EXIT HUP INT TERM
  # Resolve/download Python and both upstream-pinned backend environments during
  # install, keeping Cube's 60-second startup free of package downloads.
  node "$cube_dir/warm-python.mjs" "$runtime"
  touch "$runtime/.installed"
fi
echo 'OpenHands runtime installed.'
