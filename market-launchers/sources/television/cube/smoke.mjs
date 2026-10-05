import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await mkdtemp(path.join(os.tmpdir(), 'cube-television-'));
await writeFile(path.join(fixture, '.tv-developer'), '');
const env = {
  ...process.env,
  HOME: fixture,
  XDG_DATA_HOME: path.join(fixture, 'data'),
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
};
let child;
let output = '';
async function stop() {
  if (!child || child.exitCode !== null) return;
  const ended = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await ended; } finally { clearTimeout(timer); }
}
async function start() {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  child = spawn('bash', ['cube/start.sh'], { cwd: root, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.equal(child.exitCode, null, output);
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        const health = await res.json();
        assert.equal(health.status, 'ok');
        assert.deepEqual(health.bindAddresses, ['127.0.0.1']);
        return url;
      }
    } catch { /* wait for the actual foreground server */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready:\n${output}`);
}
try {
  execFileSync('bash', ['cube/agent-tools.sh'], { cwd: root, env, stdio: 'pipe' });
  await access(path.join(fixture, '.claude/skills/television/SKILL.md'));
  await access(path.join(fixture, '.agents/skills/television/SKILL.md'));
  const url = await start();
  const status = JSON.parse(execFileSync(path.join(fixture, '.local/bin/tv'), ['status'], { env, encoding: 'utf8' }));
  assert.equal(status.healthy, true);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<html/i);
  const created = await fetch(`${url}/channels`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Cube persistence check' }),
  });
  assert.equal(created.status, 201);
  const { channel } = await created.json();
  assert.ok(channel.id);
  await stop();
  const restarted = await start();
  const saved = await fetch(`${restarted}/channels/${channel.id}`);
  assert.equal(saved.status, 200);
  assert.match(await saved.text(), /Cube persistence check/);
  await rm(path.join(fixture, '.local/bin/tv'));
  await writeFile(path.join(fixture, '.local/bin/tv'), 'existing installation');
  const skipped = execFileSync('bash', ['cube/agent-tools.sh'], { cwd: root, env, encoding: 'utf8' });
  assert.match(skipped, /Existing tv command preserved/);
  console.log('PASS: UI, API, loopback binding, foreground shutdown, restart persistence, CLI/skills, and existing-command preservation.');
} finally {
  await stop();
  await rm(fixture, { recursive: true, force: true });
}
