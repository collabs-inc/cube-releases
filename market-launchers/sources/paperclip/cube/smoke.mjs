import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { freePort } from './gateway.mjs';
const data = await mkdtemp(path.join(os.tmpdir(), 'cube-paperclip-smoke-'));
let child;
async function launch() {
  const port = await freePort();
  child = spawn('sh', ['cube/start.sh'], { env: { ...process.env, PORT: String(port), CUBE_PAPERCLIP_DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Startup timeout')), 60000);
    child.stdout.on('data', bytes => { if (bytes.toString().includes('Paperclip is ready')) { clearTimeout(timer); resolve(); } });
    child.on('error', reject); child.on('exit', code => { clearTimeout(timer); reject(new Error(`Launcher exited ${code}; diagnostics: ${data}`)); });
  });
  return `http://127.0.0.1:${port}`;
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit'); child.kill('SIGTERM');
  const [code] = await done; child = null; assert.equal(code, 0);
}
try {
  let url = await launch();
  assert.match(await (await fetch(url)).text(), /<html/);
  const response = await fetch(`${url}/api/companies`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify({ name: 'Cube smoke company' }) });
  assert.equal(response.status, 201); const company = await response.json();
  const hosted = await new Promise((resolve, reject) => {
    const req = http.get(`${url}/api/companies`, { headers: { Host: 'paperclip-1234abcd.cube.site', 'X-Forwarded-Proto': 'https' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject);
  });
  assert.equal(hosted, 200);
  const wsStatus = await new Promise((resolve, reject) => {
    const req = http.get(`${url}/api/companies/${company.id}/events/ws`, { headers: {
      Host: 'paperclip-1234abcd.cube.site', 'X-Forwarded-Proto': 'https', Origin: 'https://paperclip-1234abcd.cube.site',
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    } });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on('response', res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject);
  });
  assert.equal(wsStatus, 101);
  assert.equal((await fetch(`${url}/api/companies`, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
  await stop();
  url = await launch();
  const restored = await (await fetch(`${url}/api/companies`)).json();
  assert(restored.some(row => row.id === company.id));
  await stop();
  console.log('PASS: Paperclip UI, local board API, company creation, Cube Host, WebSocket, CSRF, persistent restart and shutdown.');
} finally { await stop(); await rm(data, { recursive: true, force: true }); }
