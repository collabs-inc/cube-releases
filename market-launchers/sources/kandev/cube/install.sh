#!/bin/sh
set -eu
umask 077
version=0.97.0
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=linux-x64; digest=d15b5ca901fc051dfefbb40a2e0fbec8e92aaf16db8225921f32a6ccdc7d2457 ;;
  Linux-aarch64|Linux-arm64) target=linux-arm64; digest=3bba944aa4f73441864203c1a84a96e09bcdfc18d01c32cfbb8ba664b2c6b823 ;;
  Darwin-arm64) target=macos-arm64; digest=b7c74d1e1124453bbf60360d382992789bf91e311e14ff7ff0be9220cb6ad88c ;;
  Darwin-x86_64) target=macos-x64; digest=95f801319565fc79032b366f85a3b520efb1c136f5eb06542ddcf25d2a25a1ce ;;
  *) echo 'Unsupported Kandev platform.' >&2; exit 1 ;;
esac
cache="${XDG_CACHE_HOME:-$HOME/.cache}/cube-kandev"
runtime="$cache/$version-$target"
if [ -x "$runtime/bin/kandev" ] && [ -f "$runtime/.cube-sha256" ] && [ "$(cat "$runtime/.cube-sha256")" = "$digest" ]; then
  echo "Kandev $version is installed."
  exit 0
fi
mkdir -p "$cache"
stage=$(mktemp -d "$cache/.install-XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
curl --fail --location --retry 3 --silent --show-error \
  "https://github.com/kdlbs/kandev/releases/download/v$version/kandev-$target.tar.gz" \
  --output "$stage/runtime.tar.gz"
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$stage/runtime.tar.gz" | cut -d ' ' -f 1)
else
  actual=$(shasum -a 256 "$stage/runtime.tar.gz" | cut -d ' ' -f 1)
fi
[ "$actual" = "$digest" ] || { echo 'Kandev archive checksum mismatch.' >&2; exit 1; }
tar -xzf "$stage/runtime.tar.gz" -C "$stage"
[ -x "$stage/kandev/bin/kandev" ] && [ -x "$stage/kandev/bin/agentctl" ]
printf '%s\n' "$digest" > "$stage/kandev/.cube-sha256"
# Only this app's versioned cache is replaced; user commands and data are untouched.
rm -rf "$runtime"
mv "$stage/kandev" "$runtime"
echo "Installed Kandev $version ($target)."
