#!/usr/bin/env bash
set -euo pipefail
source_commit=53973c3a423fbd75a4ce68107786b4fcb90e4968
recipe_dir=$(cd -- "$(dirname -- "$0")" && pwd)
output_dir=${1:?Usage: build.sh /absolute/output/directory}
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/cube-excalidraw-build.XXXXXX")
trap 'rm -rf "$build_dir"' EXIT
test "$(yarn --version)" = 1.22.22
git init -q "$build_dir"
git -C "$build_dir" fetch --depth 1 https://github.com/excalidraw/excalidraw.git "$source_commit"
git -C "$build_dir" checkout -q --detach FETCH_HEAD
git -C "$build_dir" apply "$recipe_dir/preserve-frame-name.patch"
cd "$build_dir"
yarn install --frozen-lockfile --non-interactive
NODE_OPTIONS=--max-old-space-size=4096 VITE_APP_ENABLE_TRACKING=false yarn build:app:docker
python3 "$recipe_dir/package.py" "$build_dir" "$output_dir"
