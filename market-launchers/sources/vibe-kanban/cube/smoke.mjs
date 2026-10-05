import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = await mkdtemp(path.join(os.tmpdir(), 'cube-vibe-smoke-'));
const cache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
const data = path.join(root, 'data');
const fixtureBin = path.join(root, 'bin');
await mkdir(fixtureBin);
// Route the upstream browser-open attempt to an inert test-only command on macOS.
await writeFile(path.join(fixtureBin, 'powershell.exe'), '#!/bin/sh\nexit 0\n');
await chmod(path.join(fixtureBin, 'powershell.exe'), 0o700);
let child;
let port;
async function launch() {
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  child = spawn(process.execPath, ['cube/start.mjs'], {
    env: { ...process.env, PORT: String(port), HOME: root, XDG_CACHE_HOME: cache,
      CUBE_VIBE_DATA_DIR: data, WSL_DISTRO_NAME: 'CubeSmoke',
      PATH: `${fixtureBin}:${process.env.PATH}`, TMPDIR: root },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let diagnostics = '';
  child.stdout.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (child.exitCode !== null) throw new Error(`Vibe Kanban exited: ${child.exitCode}\n${diagnostics}`);
    if (await request('/api/health').then(r => r.status === 200).catch(() => false)) return;
    await delay(200);
  }
  throw new Error(`Vibe Kanban readiness timed out.\n${diagnostics}`);
}
function request(route, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: route, headers, method: body ? 'PUT' : 'GET' }, res => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: responseBody }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
function websocket(origin, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/workspaces/streams/ws', headers: {
      Host: host, Origin: origin, 'X-Forwarded-Proto': 'https', Connection: 'Upgrade', Upgrade: 'websocket',
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
    current.kill('SIGHUP');
    const force = setTimeout(() => { try { process.kill(-current.pid, 'SIGKILL'); } catch {} }, 15000);
    await done;
    clearTimeout(force);
  }
  assert.equal(await request('/api/health').then(() => true).catch(() => false), false, 'server was reaped');
}
try {
  await launch();
  assert.equal((await request('/')).status, 302);
  assert.match((await request('/workspaces')).body, /<html/);
  const info = JSON.parse((await request('/api/info')).body).data;
  assert.equal(info.version, '0.1.44');
  assert.equal(info.config.analytics_enabled, false, 'seed config is accepted');
  assert.equal(info.config.relay_enabled, false);
  assert.equal(info.config.workspace_dir, path.join(data, 'workspaces'));
  const host = 'vibe-kanban-abcdefgh.cube.site';
  assert.equal((await request('/api/workspaces', { Host: host, Origin: `https://${host}`, 'X-Forwarded-Proto': 'https' })).status, 200);
  assert.equal((await request('/api/workspaces', { Host: host, Origin: 'https://other-abcdefgh.cube.site' })).status, 403);
  assert.equal(await websocket(`https://${host}`, host), 101);
  assert.equal(await websocket('https://evil.example', host), 403);
  const config = { ...info.config, git_branch_prefix: 'cube-smoke' };
  assert.equal((await request('/api/config', { Host: host, Origin: `https://${host}`, 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json' }, JSON.stringify(config))).status, 200);
  await shutdown();
  await launch();
  const restored = JSON.parse((await request('/api/info')).body).data;
  assert.equal(restored.machine_id, info.machine_id, 'database identity persists');
  assert.equal(restored.config.git_branch_prefix, 'cube-smoke', 'settings survive restart');
  await shutdown();
  console.log('PASS: UI, local API, seeded persistent workspaces, Cube HTTP/WebSocket origins, config/database restart and shutdown.');
} finally {
  try { await shutdown(); }
  finally { await rm(root, { recursive: true, force: true }); }
}
