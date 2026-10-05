# Kandev for Cube

Install `https://github.com/collabs-inc/cube-kandev` in Cube's Apps surface.

This fork pins upstream [Kandev v0.97.0](https://github.com/kdlbs/kandev/releases/tag/v0.97.0),
source `e43881c7555372897b57ec51c705f1e05da43c40`. Upstream source and its AGPL-3.0
license are preserved. Cube additions are confined to `cube.json` and `cube/`.

The install downloads the upstream native archive and checks a committed SHA-256
from GitHub's release metadata before extracting it. No Go, Rust, pnpm, or web
build is needed. Linux x64 and ARM64 are supported. The scripts also accept macOS
for isolated release verification; the Cube manifest targets Linux cloud machines.

Runtime binaries live in `~/.cache/cube-kandev/0.97.0-<platform>` and persistent
Kandev data lives in `~/.local/share/cube-kandev`. Standard `XDG_CACHE_HOME` and
`XDG_DATA_HOME` overrides are honored. `CUBE_KANDEV_DATA_DIR` can relocate app
data explicitly. Cube updates replace the checkout, leaving these directories.
Removing the app leaves its cache and data for deliberate manual removal.

The foreground native launcher serves the embedded UI on `127.0.0.1:$PORT` and
supervises its backend. Cube's gate handles sign-in; Kandev runs in its upstream
single-user mode. Browser requests retain their original Host and Origin, which
Kandev validates dynamically for HTTP and WebSocket connections.

HOME is preserved, so installed Claude Code, Codex, Git and GitHub commands use
their existing sign-ins. No credentials are copied or read by the adapter.
Agent execution uses the machine's resources. Optional container, SSH and remote
executor features still require their normal upstream dependencies.

Validation: `sh -n cube/install.sh cube/start.sh`, then `sh cube/install.sh` and
`node cube/smoke.mjs`. The smoke test uses a disposable data directory and only
stops processes it starts. Installation needs `curl`, `tar`, and `sha256sum` or
`shasum`; runtime needs the installed agent CLIs for agent work.
