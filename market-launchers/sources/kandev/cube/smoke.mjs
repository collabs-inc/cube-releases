import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Kandev uses a Unix socket below its home; macOS's default TMPDIR is too long.
const tempRoot = process.platform === 'darwin' ? '/private/tmp' : os.tmpdir();
const data = await realpath(await mkdtemp(path.join(tempRoot, 'cube-kandev-smoke-')));
let child;
let port;
async function launch() {
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  child = spawn('sh', ['cube/start.sh'], {
    env: { ...process.env, PORT: String(port), CUBE_KANDEV_DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let diagnostics = '';
  child.stdout.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  for (let attempt = 0; attempt < 250; attempt++) {
    if (child.exitCode !== null) throw new Error(`Kandev exited: ${child.exitCode}\n${diagnostics}`);
    if (await request('/ready').then(r => r.status === 200).catch(() => false)) return;
    await delay(200);
  }
  throw new Error('Kandev readiness timed out.');
}
function request(route, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: route, headers, method: body ? 'POST' : 'GET' }, res => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: responseBody }));
    });
    req.setTimeout(1500, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
function websocket(origin, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/ws', headers: {
      Host: host, Origin: origin, Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    } });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on('response', res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('WebSocket timeout')));
    req.end();
  });
}
async function shutdown() {
  if (!child) return;
  const current = child;
  child = undefined;
  if (current.exitCode === null && current.signalCode === null) {
    const done = once(current, 'exit');
    current.kill('SIGTERM');
    const force = setTimeout(() => { try { process.kill(-current.pid, 'SIGKILL'); } catch {} }, 10000);
    await done;
    clearTimeout(force);
  }
  await delay(100);
  assert.equal(await request('/ready').then(() => true).catch(() => false), false, 'server was reaped');
}
try {
  await launch();
  assert.match((await request('/')).body, /<title>Kandev<\/title>/);
  const before = await request('/api/v1/app-state');
  assert.equal(before.status, 200);
  const state = JSON.parse(before.body);
  assert.ok(Object.keys(state).length > 0);
  const host = 'kandev-abcdefgh.cube.site';
  assert.equal((await request('/api/v1/app-state', { Host: host, Origin: `https://${host}`, 'X-Forwarded-Proto': 'https' })).status, 200);
  assert.equal((await request('/api/v1/app-state', { Host: host, Origin: 'https://other-abcdefgh.cube.site' })).status, 403);
  assert.equal(await websocket(`https://${host}`, host), 101);
  assert.equal(await websocket('https://evil.example', host), 403);
  const auth = JSON.parse((await request('/api/v1/auth/me')).body);
  assert.equal(auth.mode, 'disabled');
  const created = await request('/api/v1/workspaces', { 'Content-Type': 'application/json' }, JSON.stringify({ name: 'Cube smoke persistence' }));
  assert.equal(created.status, 200);
  const workspace = JSON.parse(created.body);
  assert.ok(workspace.id);
  await shutdown();
  await launch();
  assert.equal((await request('/api/v1/app-state')).status, 200);
  assert.equal(JSON.parse((await request(`/api/v1/workspaces/${workspace.id}`)).body).name, 'Cube smoke persistence');
  await shutdown();
  console.log('PASS: UI, API, Cube hostname HTTP/WebSocket, rejected foreign origins, persistent restart and shutdown.');
} finally {
  try { await shutdown(); }
  finally { await rm(data, { recursive: true, force: true }); }
}
