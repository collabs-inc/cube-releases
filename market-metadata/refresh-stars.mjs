import { readFile, rename, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** Fetch the public project's count, using upstream for integration forks. */
export async function refreshStars(catalog, { fetchRepository, now = () => new Date().toISOString() }) {
  const checkedAt = now();
  const apps = await Promise.all(catalog.apps.map(async entry => {
    const repository = entry.upstream ?? entry.repository;
    const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)$/.exec(repository);
    if (!match) throw new Error(`Invalid GitHub repository for ${entry.id}.`);
    const metadata = await fetchRepository(match[1]);
    const count = metadata.stargazers_count;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid star count for ${entry.id}.`);
    return { ...entry, githubStars: count, githubStarsUpdatedAt: checkedAt };
  }));
  return { ...catalog, apps };
}

async function main() {
  const target = new URL("../cube_market.json", import.meta.url);
  const catalog = JSON.parse(await readFile(target, "utf8"));
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const refreshed = await refreshStars(catalog, {
    async fetchRepository(repository) {
      const response = await fetch(`https://api.github.com/repos/${repository}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "cube-market-metadata",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`GitHub metadata request for ${repository} failed (HTTP ${response.status}).`);
      return response.json();
    },
  });
  // Only replace the catalog after every repository returned a valid count.
  const temporary = new URL(`../.cube_market.stars-${process.pid}.json`, import.meta.url);
  await writeFile(temporary, `${JSON.stringify(refreshed, null, 2)}\n`);
  await rename(temporary, target);
  for (const app of refreshed.apps) console.log(`${app.id}: ${app.githubStars} stars (${app.upstream ?? app.repository})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
