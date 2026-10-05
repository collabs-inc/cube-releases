# Television in Cube

Add `https://github.com/collabs-inc/television` in Cube's app launcher.
The manifest builds the fork's source and runs its browser UI on Cube's assigned
loopback port. Cube owns supervision and viewer authentication; no system service
or separate Television desktop app is installed. Telemetry is disabled for this
development integration.

Node 24.21.0 is downloaded from nodejs.org, checksum-verified, and kept in the
user's cache. It does not replace the machine's Node. The upstream desktop icon
is used unchanged.

Channels, artifacts, and configuration live in
`${XDG_DATA_HOME:-$HOME/.local/share}/cube-television`, outside the checkout so app
updates preserve them. This is separate from a standalone `~/.television` home.

The installer adds `tv` to `~/.local/bin` and installs the bundled skills in
`~/.agents/skills` and `~/.claude/skills`. The command selects this app's data home
automatically. An existing `~/.local/bin/tv` belonging to another installation is
preserved; in that case the skills are left alone, and you can use the CLI below.

Agents on the same machine can also use the built CLI directly:

```sh
node packages/cli/dist/cli.cjs --home "${XDG_DATA_HOME:-$HOME/.local/share}/cube-television" status
node packages/cli/dist/cli.cjs --home "${XDG_DATA_HOME:-$HOME/.local/share}/cube-television" --help
```

Run these from the installed app checkout (Cube → Manage app → Customise can
create a regular working repository).
The browser UI has upstream's browser limitations for external-webpage artifacts.

Verification: `bash cube/install.sh`, then `node cube/smoke.mjs`. The smoke check
uses a temporary home and verifies the UI, API, loopback binding, foreground
shutdown, and persisted channels after restarting with a new assigned port.
