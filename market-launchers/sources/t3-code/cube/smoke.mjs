import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const data = await mkdtemp(path.join(os.tmpdir(), 'cube-t3-smoke-'));
let processUnderTest;
async function launch() {
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['cube/start.mjs'], {
    env: { ...process.env, PORT: String(port), CUBE_T3_DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processUnderTest = child;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Startup timed out')), 60000);
    child.stdout.on('data', bytes => {
      if (bytes.toString().includes('T3 Code is ready')) { clearTimeout(timer); resolve(); }
    });
    child.on('error', reject);
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Launcher exited: ${code}`)); });
  });
  return `http://127.0.0.1:${port}`;
}
async function shutdown() {
  const child = processUnderTest;
  if (!child) return;
  const runtime = await readFile(path.join(data, 'userdata/server-runtime.json'), 'utf8').then(JSON.parse).catch(() => undefined);
  let code = child.exitCode;
  if (child.exitCode === null && child.signalCode === null) {
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 12000);
    [code] = await done;
    clearTimeout(force);
  }
  processUnderTest = undefined;
  assert.equal(code, 0, 'launcher shuts down cleanly');
  if (runtime) assert.throws(() => process.kill(runtime.pid, 0), 'upstream process is also reaped');
}
try {
  const first = await launch();
  assert.match(await (await fetch(first)).text(), /<html/);
  const session = await (await fetch(`${first}/api/auth/session`)).json();
  assert.equal(session.authenticated, true, 'Cube opens an authenticated T3 session');
  assert.ok(!('token' in session), 'gateway credential stays on the server');
  const environment = await (await fetch(`${first}/.well-known/t3/environment`)).json();
  // Node's fetch replaces Host; use the HTTP client to exercise an actual hostile host.
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const request = http.get(first, { headers: { Host: 'evil.example' } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('error', reject);
  });
  assert.equal(hostileHostStatus, 403);
  assert.equal((await fetch(`${first}/api/auth/session`, {
    headers: { Origin: 'https://evil.example' },
  })).status, 403, 'cross-origin reads cannot borrow the gateway credential');
  assert.equal((await fetch(`${first}/api/auth/session`, {
    headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': 'empty' },
  })).status, 403);
  assert.equal((await fetch(first, {
    headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': 'iframe' },
  })).status, 200, 'Cube can still embed the app document');
  assert.equal((await fetch(`${first}/api/auth/websocket-ticket`, {
    method: 'POST', headers: { Origin: 'https://evil.example' },
  })).status, 403);
  assert.equal((await fetch(`${first}/api/auth/websocket-ticket`, {
    method: 'POST', headers: { Origin: first },
  })).status, 200, 'same-origin browser can establish a WebSocket');
  await shutdown();
  const second = await launch();
  const restored = await (await fetch(`${second}/.well-known/t3/environment`)).json();
  assert.equal(restored.environmentId, environment.environmentId, 'environment survives restart on a new port');
  assert.equal((await (await fetch(`${second}/api/auth/session`)).json()).authenticated, true);
  await shutdown();
  console.log('PASS: HTTP UI, authenticated API, origin/host checks, WebSocket ticket, persistent restart, and process cleanup.');
} finally {
  try { if (processUnderTest) await shutdown(); }
  finally { await rm(data, { recursive: true, force: true }); }
}
