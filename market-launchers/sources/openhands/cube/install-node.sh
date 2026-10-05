#!/bin/sh
set -eu
# Private toolchain: does not replace the machine's Node or npm.
node_version=24.21.0
node_dir="$1/node-$node_version"
if [ -x "$node_dir/bin/node" ]; then exit 0; fi
case "$(uname -s)" in Linux) platform=linux;; Darwin) platform=darwin;; *) exit 1;; esac
case "$(uname -m)" in x86_64) arch=x64;; aarch64|arm64) arch=arm64;; *) exit 1;; esac
archive="node-v$node_version-$platform-$arch.tar.gz"
tmp=$(mktemp -d "$1/node-download.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
curl -fsSL --retry 3 "https://nodejs.org/dist/v$node_version/$archive" -o "$tmp/$archive"
curl -fsSL --retry 3 "https://nodejs.org/dist/v$node_version/SHASUMS256.txt" -o "$tmp/sums"
expected=$(awk -v file="$archive" '$2 == file {print $1}' "$tmp/sums")
actual=$(node -e 'const fs=require("node:fs"),c=require("node:crypto");console.log(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$tmp/$archive")
test -n "$expected" && test "$expected" = "$actual"
mkdir "$tmp/node"
tar -xzf "$tmp/$archive" -C "$tmp/node" --strip-components=1
mv "$tmp/node" "$node_dir"
