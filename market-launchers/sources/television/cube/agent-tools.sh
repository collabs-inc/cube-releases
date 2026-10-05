#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tv_command="$PWD/cube/tv"
tv_link="$HOME/.local/bin/tv"
mkdir -p "$HOME/.local/bin"
if [ ! -e "$tv_link" ] && [ ! -L "$tv_link" ]; then
  ln -s "$tv_command" "$tv_link"
fi
if [ "$(readlink "$tv_link" 2>/dev/null || true)" != "$tv_command" ]; then
  echo 'Existing tv command preserved. See cube/README.md for this app’s CLI.'
  exit 0
fi
# Install only names owned by Television; other agent skills are retained.
node packages/cli/dist/cli.cjs skills install "$HOME/.agents/skills"
node packages/cli/dist/cli.cjs skills install "$HOME/.claude/skills"
