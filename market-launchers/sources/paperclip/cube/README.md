# Paperclip in Cube

Install `https://github.com/collabs-inc/paperclip` as a Cube app. The default `cube-app` branch preserves upstream's MIT license and is based on `v2026.1001.0` (`8f8a0ab7effbd6a0584107d8038736c134ee5047`).

The installer downloads checksum-verified Node 24.21.0 and installs the upstream prebuilt `paperclipai@2026.1001.0` npm distribution with the committed dependency lock. No source build, Docker, sudo, global Node change or global CLI installation is needed. Runtime files stay under `~/.cache/cube-paperclip/2026.1001.0-1` and the private toolchain under `~/.cache/cube-paperclip/node-24.21.0` (respects `XDG_CACHE_HOME`). Allow about 1.5 GB for the runtime plus download cache and growing application data; Linux size can differ. Requires curl, tar and Node to bootstrap. Embedded PostgreSQL runs as the ordinary user.

Cube runs `sh cube/start.sh` in the foreground. A Node adapter listens only on `127.0.0.1:$PORT`, supervises Paperclip on another loopback port, and streams HTTP and WebSockets. It preserves each request's Host, checks Cube or loopback hostnames and same-origin browser requests, and uses upstream `local_trusted` mode, so Cube's gate is the only sign-in. Cross-site iframe navigations also work after Paperclip's service worker takes control: its forwarded GET retains browser-controlled navigation mode even though Chromium changes the destination to `empty`. Cross-site API fetches, writes and foreign Origins remain refused. The only runtime patch adds Cube's generated hostname pattern to upstream's private-hostname guard; exact source matching makes an incompatible upstream change fail installation.

Data, PostgreSQL, agent workspaces, backups and the app's own signing secret live under `~/.local/share/cube-paperclip` (respects `XDG_DATA_HOME`), outside the replaceable checkout. HOME is preserved so the installed Claude Code and Codex adapters can use existing sign-ins. A fresh instance opens the normal company setup. The launcher creates its own agent JWT secret once; it never reads or copies the machine's agent credentials. Upstream diagnostics are retained in `cube-runtime.log` in the data directory, outside Cube's public session output. Telemetry is disabled.

`CUBE_PAPERCLIP_CACHE_DIR` and `CUBE_PAPERCLIP_DATA_DIR` support isolated installations/tests. To validate after install:

```sh
node --test cube/gateway.test.mjs
node cube/smoke.mjs
```

The smoke test uses temporary data, creates a company, verifies the UI, board API, actual live-events WebSocket, dynamic Cube Host, CSRF refusal, persistent restart and foreground shutdown, then removes its temporary data. Local macOS validation exercises the same prebuilt distribution; the declared supported target is Linux. Full upstream source build/typecheck/test suites were not run because the integration does not change upstream source or rebuild its release.

When changing the runtime distribution, dependencies or runtime patch, bump the private runtime directory suffix in install/start together, so an update never changes the previous version's cached runtime and Cube can roll back safely.
