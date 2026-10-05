#!/bin/sh
set -eu
umask 077
version=v0.1.44-20260424091429
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=linux-x64; digest=083f15f027a7052916852f40610db34b021f7e7749593623ac3f67a090447a6b ;;
  Linux-aarch64|Linux-arm64) target=linux-arm64; digest=e148c8159b82f9b08937b09b7badee76d6d627410f582b4a52801f2248859a36 ;;
  Darwin-arm64) target=macos-arm64; digest=669addc1757abab7c6f3e04815b51189977b8de8bd4844b514566f2f4ed58ddd ;;
  Darwin-x86_64) target=macos-x64; digest=227952463e8756fa560fed4544c336a8436195604543e9720eac546c7c48bef9 ;;
  *) echo 'Unsupported Vibe Kanban platform.' >&2; exit 1 ;;
esac
cache="${XDG_CACHE_HOME:-$HOME/.cache}/cube-vibe-kanban"
runtime="$cache/$version-$target"
if [ -x "$runtime/vibe-kanban" ] && [ -f "$runtime/.cube-sha256" ] && [ "$(cat "$runtime/.cube-sha256")" = "$digest" ]; then
  echo "Vibe Kanban $version is installed."
  exit 0
fi
mkdir -p "$cache"
stage=$(mktemp -d "$cache/.install-XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
curl --fail --location --retry 3 --silent --show-error \
  "https://npm-cdn.vibekanban.com/binaries/$version/$target/vibe-kanban.zip" \
  --output "$stage/runtime.zip"
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$stage/runtime.zip" | cut -d ' ' -f 1)
else
  actual=$(shasum -a 256 "$stage/runtime.zip" | cut -d ' ' -f 1)
fi
[ "$actual" = "$digest" ] || { echo 'Vibe Kanban archive checksum mismatch.' >&2; exit 1; }
mkdir "$stage/runtime"
unzip -q "$stage/runtime.zip" vibe-kanban -d "$stage/runtime"
chmod 700 "$stage/runtime/vibe-kanban"
printf '%s\n' "$digest" > "$stage/runtime/.cube-sha256"
rm -rf "$runtime"
mv "$stage/runtime" "$runtime"
echo "Installed Vibe Kanban $version ($target)."
