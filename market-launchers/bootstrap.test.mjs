import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.dirname(fileURLToPath(import.meta.url));
const bootstrap = await readFile(path.join(root, 'bootstrap.mjs'), 'utf8');
const provenance = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));

function run(cwd, app, digest = provenance[app].sha256, status = 200) {
  const archive = path.join(root, 'bundles', provenance[app].bundle);
  // Exercise the exact embedded command, substituting only its HTTP response.
  const mock = `globalThis.fetch = async () => new Response(await (await import('node:fs/promises')).readFile(${JSON.stringify(archive)}), { status: ${status} });\n`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', mock + bootstrap,
    `https://raw.githubusercontent.com/collabs-inc/cube-releases/main/market-launchers/bundles/${provenance[app].bundle}`, digest, app], { cwd, encoding: 'utf8' });
}

for (const app of Object.keys(provenance)) {
  test(`${app}: checksum-pinned bundle extracts exact source and can be refreshed`, async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'cube-side-manifest-'));
    try {
      const archive = await readFile(path.join(root, 'bundles', provenance[app].bundle));
      assert.equal(createHash('sha256').update(archive).digest('hex'), provenance[app].sha256);
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = run(temp, app);
        assert.equal(result.status, 0, result.stderr);
        for (const file of await readdir(path.join(root, 'sources', app, 'cube'))) {
          assert.deepEqual(await readFile(path.join(temp, 'cube', file)), await readFile(path.join(root, 'sources', app, 'cube', file)));
        }
      }
      assert.deepEqual(await readdir(temp), ['cube']);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}

test('rejects corrupt downloads and preserves an existing launcher on network failure', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cube-side-manifest-'));
  try {
    assert.match(run(temp, 't3-code', '0'.repeat(64)).stderr, /checksum mismatch/);
    assert.deepEqual(await readdir(temp), []);
    assert.equal(run(temp, 't3-code').status, 0);
    await writeFile(path.join(temp, 'cube', 'sentinel'), 'keep');
    assert.match(run(temp, 't3-code', undefined, 503).stderr, /download failed/);
    assert.equal(await readFile(path.join(temp, 'cube', 'sentinel'), 'utf8'), 'keep');
    assert.deepEqual(await readdir(temp), ['cube']);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('refuses an upstream cube directory or symlink without changing its files', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cube-side-manifest-'));
  try {
    await mkdir(path.join(temp, 'cube'));
    await writeFile(path.join(temp, 'cube', 'sentinel'), 'upstream');
    assert.match(run(temp, 't3-code').stderr, /refusing to overwrite/);
    assert.equal(await readFile(path.join(temp, 'cube', 'sentinel'), 'utf8'), 'upstream');
    await rm(path.join(temp, 'cube'), { recursive: true });
    await mkdir(path.join(temp, 'external'));
    await writeFile(path.join(temp, 'external', '.market-launcher'), 't3-code\n');
    await symlink(path.join(temp, 'external'), path.join(temp, 'cube'));
    assert.match(run(temp, 't3-code').stderr, /refusing to overwrite/);
    assert.equal(await readFile(path.join(temp, 'external', '.market-launcher'), 'utf8'), 't3-code\n');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
