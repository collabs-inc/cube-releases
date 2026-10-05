# T3 Code in Cube

Install `https://github.com/collabs-inc/t3code` as a Cube app. The fork's default
`cube-app` branch adds a manifest and launcher to upstream release `v0.0.45`.

The installer uses T3's checksum-verified, self-contained server release. It
stores the runtime under `~/.cache/cube-t3code`, without changing a global T3
installation. Node 22 or newer is needed for the Cube adapter. Linux x64/arm64
and Apple Silicon macOS have upstream server archives; Intel macOS does not.

App data lives in `~/.local/share/cube-t3code` (respects `XDG_DATA_HOME`), outside
the checkout. `CUBE_T3_DATA_DIR` selects another directory for an isolated test.
The user's HOME is preserved so installed Claude Code and Codex can use their
existing sign-ins. Add a project using its path on the cloud machine.

Cube starts a foreground adapter on `127.0.0.1:$PORT`. It supervises T3 on another
loopback port and forwards HTTP and WebSockets. The adapter uses T3's official
auth CLI to issue a private 48-hour session, refreshes it daily, and revokes it
on shutdown. The credential stays in process memory. Cube's gate controls access;
users do not need a second T3 pairing step. Upstream startup pairing output is
suppressed because it contains credentials; T3 keeps its own diagnostic logs in
the data directory. T3 itself is unmodified.

Update the Cube fork to change the pinned runtime. Do not install T3's separate
background service for this app: Cube already supervises it.
