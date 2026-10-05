# Cube Market catalog

`cube_market.json` is the public catalog read by Cube's Market app. It is maintained separately from this repository's generated release assets and tags.

List the original project and install from its repository wherever possible. Keep Cube-specific launch support in a side manifest here; use a fork only when actual application changes are necessary. See [market-launchers](market-launchers/README.md) for the checksum-pinned launch bundles. Existing installations keep their saved source and recipe.

The root object has `version: 1` and an `apps` array. Every entry has:

- `id`: a unique lowercase kebab-case identifier, at most 64 characters.
- `name`: the app's display name, at most 64 characters.
- `description`: a short description, at most 200 characters.
- `repository`: an HTTPS GitHub repository URL. Cube clones its default branch.
- `icon` (optional): an HTTPS image URL for the catalog listing.
- `tags` (optional): up to eight search labels, at most 24 characters each.
- `manifest` (optional): a complete Cube launch manifest, for a repository that does not ship `cube.json`.
- `creator` (optional): `{ "name": "Original team", "url": "https://github.com/original" }`. Credit the original author or organization, not the owner of an integration fork. Names are at most 128 characters; URLs must use HTTPS.
- `upstream` (optional): the original HTTPS GitHub repository URL when `repository` is a Cube integration fork.
- `previousRepositories` (optional): up to eight former install repositories. Market recognizes their existing installations as this app, while new installations always use `repository`. Aliases must not overlap another entry's repository or aliases. They do not retarget an installed app's update source.
- `website` (optional): the project's HTTPS website.
- `license` (optional): the repository's license identifier, at most 128 characters. Omit when unknown or mixed; the UI links to the repository rather than guessing.
- `revision` (optional): a full 40- or 64-character Git commit hash from the install repository's default branch. This is a catalog snapshot, not an install pin or an upstream release version.
- `updatedAt` (optional): that revision's ISO timestamp.
- `sourceSizeBytes` (optional): GitHub's approximate repository size (`size` in KiB × 1024), a non-negative safe integer. This is not the download or installed size; build dependencies and app data can make an installation much larger.

Refresh this metadata from GitHub when updating an integration. Market measures installed app-folder usage live on the selected machine and shows its actual installed revision separately. These fields are optional additions to version 1, so older Cube builds can still read the catalog.

For repositories that already contain `cube.json`, omit `manifest`. For an upstream repository with a separately maintained launch recipe, the shape is:

```json
{
  "id": "example-app",
  "name": "Example App",
  "description": "An example catalog entry; replace the repository and commands with a verified app.",
  "repository": "https://github.com/example/app",
  "tags": ["Productivity"],
  "manifest": {
    "name": "Example App",
    "install": "npm ci && npm run build",
    "start": "npm start -- --host 127.0.0.1 --port $PORT",
    "platforms": ["linux"]
  }
}
```

The manifest uses the same schema as `cube.json`: `name`, optional `description`, `install`, `start`, `root`, `icon` and `platforms`. A server must listen on Cube's `$PORT`. A static app can use `root` instead of `start`. Manifest icon paths are relative to the cloned repository; catalog icons are HTTPS URLs.

Cube asks for confirmation before installation. A supplied manifest is saved with that installation and reused on retries and repository updates. Editing this catalog does not silently replace an existing installation's recipe. Existing installations of a repository are opened rather than duplicated.

Keep entries limited to browser UIs that run directly in Cube. Do not list streamed desktop apps. Check each app's license and setup requirements before adding it. Catalog presence does not provision model-provider credentials or waive an app's own sign-in.

Cube validates the catalog (maximum 1 MiB and 200 entries), unique IDs/repository URLs, and supplied manifests (maximum 64 KiB each). The source parser and tests live in Cube's `packages/shared/src/app-market.ts` and `app-market.test.ts`.
