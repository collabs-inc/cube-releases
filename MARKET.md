# Cube Market catalog

`cube_market.json` is the public catalog read by Cube's Market app. It is maintained separately from this repository's generated release assets and tags.

The root object has `version: 1` and an `apps` array. Every entry has:

- `id`: a unique lowercase kebab-case identifier, at most 64 characters.
- `name`: the app's display name, at most 64 characters.
- `description`: a short description, at most 200 characters.
- `repository`: an HTTPS GitHub repository URL. Cube clones its default branch.
- `icon` (optional): an HTTPS image URL for the catalog listing.
- `tags` (optional): up to eight search labels, at most 24 characters each.
- `manifest` (optional): a complete Cube launch manifest, for a repository that does not ship `cube.json`.

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
