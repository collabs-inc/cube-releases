#!/usr/bin/env bash
# Private build toolchain; never replace the machine's Node installation.
set -euo pipefail
tv_node_version=24.21.0
tv_tools="${XDG_CACHE_HOME:-$HOME/.cache}/cube-television/node-v$tv_node_version"
case "$(uname -s)" in
  Linux) tv_os=linux ;;
  Darwin) tv_os=darwin ;;
  *) echo 'Television supports Linux and macOS.' >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64) tv_arch=x64 ;;
  aarch64|arm64) tv_arch=arm64 ;;
  *) echo 'Unsupported CPU architecture.' >&2; exit 1 ;;
esac
if [ ! -x "$tv_tools/bin/node" ]; then
  tv_archive="node-v$tv_node_version-$tv_os-$tv_arch.tar.gz"
  tv_download=$(mktemp -d)
  trap 'rm -rf "$tv_download"' EXIT
  curl -fSL --retry 3 "https://nodejs.org/dist/v$tv_node_version/$tv_archive" -o "$tv_download/$tv_archive"
  curl -fsSL --retry 3 "https://nodejs.org/dist/v$tv_node_version/SHASUMS256.txt" -o "$tv_download/SHASUMS256.txt"
  node - "$tv_download" "$tv_archive" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [dir, name] = process.argv.slice(2);
const expected = fs.readFileSync(`${dir}/SHASUMS256.txt`, 'utf8').split('\n')
  .find(line => line.endsWith(`  ${name}`))?.split(' ')[0];
const actual = crypto.createHash('sha256').update(fs.readFileSync(`${dir}/${name}`)).digest('hex');
if (!expected || actual !== expected) throw new Error('Node download checksum mismatch');
NODE
  mkdir -p "$(dirname "$tv_tools")"
  tar -xzf "$tv_download/$tv_archive" -C "$tv_download"
  mv "$tv_download/node-v$tv_node_version-$tv_os-$tv_arch" "$tv_tools"
  rm -rf "$tv_download"
  trap - EXIT
fi
export PATH="$tv_tools/bin:$PATH"
