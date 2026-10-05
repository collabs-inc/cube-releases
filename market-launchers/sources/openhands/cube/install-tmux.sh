#!/bin/sh
set -eu
if command -v tmux >/dev/null 2>&1; then exit 0; fi
runtime=$1
# Cube's cloud image is Debian 12 amd64. Unpack the distribution binaries
# privately; never run dpkg install, sudo, or the privileged utmp helper.
if [ "$(uname -s)/$(uname -m)" != Linux/x86_64 ]; then
  echo 'Install tmux on this machine before installing OpenHands.' >&2; exit 1
fi
command -v dpkg-deb >/dev/null
tmp=$(mktemp -d "$runtime/tmux-download.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
fetch_deb() {
  url=$1 expected=$2 dest=$3
  curl -fsSL --retry 3 "https://deb.debian.org/debian/$url" -o "$dest"
  actual=$(node -e 'const fs=require("node:fs"),c=require("node:crypto");console.log(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$dest")
  test "$actual" = "$expected"
  dpkg-deb -x "$dest" "$runtime/tmux"
}
fetch_deb pool/main/t/tmux/tmux_3.3a-3_amd64.deb 6bd1558face5e145d66d72c9557cbc7ff5ad66701e94dcd568e6daf081269018 "$tmp/tmux.deb"
fetch_deb pool/main/libu/libutempter/libutempter0_1.2.1-3_amd64.deb e2bf3c7fb0ebd7d7966166d98320767adcd35a6d1eabc32220d8219c9efb1c0f "$tmp/lib.deb"
mkdir -p "$runtime/bin"
cat > "$runtime/bin/tmux" <<'WRAPPER'
#!/bin/sh
runtime=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export LD_LIBRARY_PATH="$runtime/tmux/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$runtime/tmux/usr/bin/tmux" "$@"
WRAPPER
chmod +x "$runtime/bin/tmux"
"$runtime/bin/tmux" -V
