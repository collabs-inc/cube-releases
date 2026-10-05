#!/bin/sh
set -eu
# Keep the pinned upstream runtime private; never replace a user's t3 command.
export T3CODE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}/cube-t3code"
export T3CODE_INSTALL_BIN_DIR="$T3CODE_HOME/bin"
export T3CODE_VERSION=0.0.45
unset T3CODE_RELEASE_BASE_URL
sh scripts/install.sh
