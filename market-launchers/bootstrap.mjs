// Embedded into each side manifest's install command; the app needs only Node and tar.
// The pinned digest makes the launch recipe reproducible even though the catalog is live.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [url, digest, app] = process.argv.slice(1);
if (!url?.startsWith('https://raw.githubusercontent.com/collabs-inc/cube-releases/') || !/^[a-f0-9]{64}$/.test(digest || '') || !/^[a-z0-9-]+$/.test(app || '')) throw new Error('Invalid launch recipe.');
const target = path.resolve('cube');
const existing = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
if (existing && (existing.isSymbolicLink() || !existing.isDirectory() || await readFile(path.join(target, '.market-launcher'), 'utf8').catch(() => '') !== `${app}\n`)) {
  throw new Error('This repository already has a cube folder; refusing to overwrite it.');
}
const temporary = await mkdtemp(path.resolve('.cube-launch-'));
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Launcher download failed (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Launcher checksum mismatch.');
  const archive = path.join(temporary, 'launcher.tar.gz');
  await writeFile(archive, bytes);
  execFileSync('tar', ['-xzf', archive, '-C', temporary], { stdio: 'inherit' });
  if (await readFile(path.join(temporary, 'cube/.market-launcher'), 'utf8') !== `${app}\n`) throw new Error('Wrong launcher archive.');
  if (existing) await rm(target, { recursive: true });
  await rename(path.join(temporary, 'cube'), target);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
