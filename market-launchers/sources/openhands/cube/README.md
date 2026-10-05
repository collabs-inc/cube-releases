# OpenHands Agent Canvas in Cube

Install `https://github.com/collabs-inc/OpenHands` as a Cube app. The default `cube-app` branch preserves upstream's MIT license and is based on `v1.24.0` (`7dc6805406ea3c76cb4a3ce407c3c72d481b0ac6`). This is the current Agent Canvas product, with a local agent backend and automations.

The installer uses the prebuilt `@openhands/agent-canvas@1.24.0` npm release, its committed npm dependency lock, checksum-verified Node 24.21.0 and uv 0.12.23, and managed Python 3.12. Upstream's own version pins select `openhands-agent-server==1.49.6`, matching SDK/tools/workspace packages, and `openhands-automation==1.15.1`. Both Python environments are downloaded and their application imports warmed during install. The adapter immediately serves an explicit startup page and switches to the application once all three upstream APIs answer. Initialization is capped at five minutes; failure exits the supervisor so Cube can report it. There is no Docker, source frontend build, sudo or global toolchain change.

The declared target is Linux. On Cube's Debian 12 amd64 cloud image, if tmux is absent, the installer unpacks checksum-pinned Debian tmux 3.3a-3 and libutempter 1.2.1-3 into its own cache. It uses the image's existing libevent and libtinfo libraries. It never installs a privileged helper. Other Linux machines must already provide tmux or the same Debian-compatible libraries and dpkg-deb. curl, tar and Node are needed to bootstrap. No system Python is used. The macOS smoke test uses the same npm/Python stack with the machine's tmux.

Runtime files live in `~/.cache/cube-openhands/1.24.0-2` and the private Node in `~/.cache/cube-openhands/node-24.21.0` (respects `XDG_CACHE_HOME`). The measured macOS runtime is about 2.6 GB; allow roughly 3 GB plus download cache and growing app data on Linux. No source compilation is needed for the tested platform. The foreground process supervises the upstream launcher, agent server, automation server, static frontend and ingress. Each HTTP listener is loopback-only. A small exact-match runtime patch changes stable 1.24.0's two wildcard Node listener defaults to loopback; newer upstream versions already have bind-policy work. The upstream three-second forced-shutdown delay is shortened to one second so all owned service groups stop within Cube’s HUP/TERM/KILL deadline.

Cube's adapter binds `127.0.0.1:$PORT`, reads the browser's Host on each request, permits Cube/loopback hosts, enforces same-origin HTTP/WebSocket traffic and forwards to a dynamically allocated upstream ingress. Upstream local mode provides its own session to the frontend, so there is no second pairing/login. State, conversations, settings, encryption keys, automations and logs live in `~/.local/share/cube-openhands` (respects `XDG_DATA_HOME`), outside the checkout. HOME is preserved, and the initial working directory is `~/repos`, so ACP agents can use the machine's existing sign-ins. Telemetry is disabled. Choose Claude Code, Codex or an OpenHands LLM profile in the UI before starting agent work. Optional browser/editor tools still depend on their upstream runtime prerequisites.

`CUBE_OPENHANDS_CACHE_DIR` and `CUBE_OPENHANDS_DATA_DIR` support isolated tests. The upstream diagnostics stay in `cube-runtime.log` in the data directory. The launcher's session output does not include upstream's generated credentials.

```sh
node --test cube/gateway.test.mjs
node cube/smoke.mjs
```

The gateway test uses real HTTP and WebSocket upgrades. The smoke test starts the full stack against temporary state, validates HTML/local session injection, authenticated agent and automation APIs, dynamic Cube Host and CSRF refusal, restarts to verify state retention, and checks all service ports are closed on shutdown. No LLM request is sent. Full upstream lint/build/test suites were not run because this integration uses the prebuilt release and changes only packaging/launch code.

When changing the npm/Python distribution, dependencies or runtime patches, bump the runtime directory suffix in install/start together to preserve the previous cached runtime for Cube rollback.
