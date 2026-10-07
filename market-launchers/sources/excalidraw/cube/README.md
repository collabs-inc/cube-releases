# Excalidraw on Cube

Original project: [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw), MIT. Runtime source: `53973c3a423fbd75a4ce68107786b4fcb90e4968` (2026-10-06).

This side manifest installs a checksum-pinned static build into `cube/public/`. Cube serves it directly, with no app process, package manager, build toolchain or extra database on the user's machine. Node and tar are the only installation prerequisites. The upstream checkout remains untouched. The pinned runtime stays the same on repository updates until a new recipe is explicitly installed.

The one compatibility patch preserves an embedding host's `window.name`. Cube uses that name to recognize the iframe's load completion; upstream's unconditional `_excalidraw` assignment otherwise leaves Cube's loading cover visible. Unnamed standalone tabs retain upstream's behavior. `preserve-frame-name.patch` contains the complete change. The production build disables upstream tracking and Sentry.

Drawings autosave in this browser's storage, not in the Cube filesystem. Export `.excalidraw` files for durable copies or to move between devices. Sharing, live collaboration, libraries and AI retain upstream's external services and requirements; this package does not self-host those services or provide Excalidraw Plus.

## Rebuild

With Node 22, Yarn 1.22.22, Python 3, git and tar available, run `bash market-launchers/sources/excalidraw/cube/build.sh /absolute/path/to/output`. The script downloads the pinned source into a disposable directory, applies the patch, installs the locked dependencies, builds the site and writes a deterministic archive plus its SHA-256. Builds need roughly 4 GiB of available memory. Inspect and test the new archive before adding it to `market-launchers/bundles/`; never replace an existing published bundle.

The archive includes these reviewable build files, the upstream MIT license, icon and static output. `package.py` can also package an already built checkout with the same patch. Record the resulting digest and upstream commit in `provenance.json`, publish the archive in its own commit, then pin that commit's raw URL and digest in the catalog manifest.

## Verification

Run the repository's `node --test market-launchers/bootstrap.test.mjs`, validate the catalog with Cube's `parseCubeMarket`, and install the exact manifest into a disposable app folder. In Electron, embed the installed page with a `cube-site:` frame name and assert `did-frame-finish-load` still sees it. In a browser, draw a shape and reload to verify autosave. The initial package passed both checks, including Cube's production gate and Electron 40.
