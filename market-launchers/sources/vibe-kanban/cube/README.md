# Vibe Kanban for Cube

Install `https://github.com/collabs-inc/cube-vibe-kanban` from Cube's Apps surface.

This fork pins upstream [v0.1.44-20260424091429](https://github.com/BloopAI/vibe-kanban/releases/tag/v0.1.44-20260424091429),
source `4deb7eca8f381f7cbc1f9d15515a9ab8f8009053`. Original source and Apache-2.0
licensing are retained. Cube additions live in `cube.json` and `cube/`.

The upstream company has announced its shutdown. This package runs the local
workspaces, coding agents and review UI; cloud projects, boards, relay and team
services are not supplied by this integration. Cube opens the local Workspaces
section by redirecting exact GET `/` to `/workspaces`, preserving saved accounts
and project preferences.

Installation fetches the exact native Rust binary used by upstream's npm CLI,
checks a committed SHA-256 from its versioned distribution manifest, and installs
it privately. No Cargo build, npm dependency install, or latest-version lookup
happens at startup. Linux x64 and ARM64 are supported; macOS script support is for
isolated verification and is not advertised by the Cube manifest. Installation
needs curl, unzip, and sha256sum or shasum. The foreground launcher needs Node 22.

The binary cache is `~/.cache/cube-vibe-kanban/<release>-<platform>`. On Linux, app
data is `~/.local/share/cube-vibe-kanban/vibe-kanban` and new workspaces default to
`~/.local/share/cube-vibe-kanban/workspaces`. XDG_CACHE_HOME and XDG_DATA_HOME are
honored; CUBE_VIBE_DATA_DIR overrides the outer data directory. These directories
survive checkout replacement and app removal. The first-run config selects
persistent workspaces, disables analytics and relay, and leaves onboarding to the
user. Existing settings are never rewritten. The macOS runtime uses its upstream
Application Support directory instead of XDG, so tests use a disposable HOME.
Automatic orphan/expired worktree cleanup is disabled because upstream scans a
shared temporary directory that may belong to another Vibe Kanban installation.
Users can remove their own workspaces explicitly in the app.

HOME stays unchanged in normal operation, allowing installed Claude Code, Codex,
Git and GitHub commands to reuse existing sign-ins. The adapter never reads or
copies credential files. App settings may install or select additional agents.

The Node landing proxy, native server and auxiliary preview proxy bind 127.0.0.1;
only the landing proxy uses Cube's PORT. It forwards all other HTTP and WebSocket
paths, retaining Host and Origin for upstream checks. Cube authenticates requests before they reach
the app. The pinned middleware compares Origin with each request's Host, so the
dynamic Cube hostname and desktop gate port work without a wildcard origin list.
The upstream binary attempts to open a browser at boot; on the headless cloud
machine this is harmless and the UI opens through Cube.

Validate with `sh -n cube/install.sh`, `node --check cube/start.mjs`,
`sh cube/install.sh` and `node cube/smoke.mjs`. The smoke test uses isolated data,
tests UI/API/origins/WebSocket and config persistence, and stops its own server.
`node --test cube/*.test.mjs` covers the landing proxy and owned process cleanup.
