import test from "node:test";
import assert from "node:assert/strict";
import { refreshStars } from "./refresh-stars.mjs";

test("records original-repository counts and preserves catalog metadata", async () => {
  const catalog = { version: 1, apps: [
    { id: "fork", repository: "https://github.com/cube/fork", upstream: "https://github.com/original/app", manifest: { name: "App", start: "node server.js" } },
    { id: "native", repository: "https://github.com/original/native" },
  ] };
  const requests = [];
  const result = await refreshStars(catalog, {
    now: () => "2026-10-04T12:00:00Z",
    fetchRepository: async repository => { requests.push(repository); return { stargazers_count: repository.endsWith("native") ? 0 : 12345 }; },
  });
  assert.deepEqual(requests, ["original/app", "original/native"]);
  assert.deepEqual(result.apps, catalog.apps.map((entry, index) => ({ ...entry, githubStars: index ? 0 : 12345, githubStarsUpdatedAt: "2026-10-04T12:00:00Z" })));
  assert.equal(catalog.apps[0].githubStars, undefined);
});

test("rejects unavailable or invalid counts instead of replacing them with zero", async () => {
  const catalog = { version: 1, apps: [{ id: "app", repository: "https://github.com/owner/app", githubStars: 12 }] };
  for (const count of [undefined, null, -1, 1.5, "12", Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(refreshStars(catalog, { fetchRepository: async () => ({ stargazers_count: count }) }), /Invalid star count/);
  }
  await assert.rejects(refreshStars(catalog, { fetchRepository: async () => { throw new Error("Offline"); } }), /Offline/);
  assert.equal(catalog.apps[0].githubStars, 12);
});
