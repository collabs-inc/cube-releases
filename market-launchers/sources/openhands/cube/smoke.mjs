import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { freePort } from './gateway.mjs';
const data = await mkdtemp(path.join(os.tmpdir(), 'cube-openhands-smoke-'));
let child;
let services = [];
async function launch() {
  const port = await freePort();
  child = spawn('sh', ['cube/start.sh'], { env: { ...process.env, PORT: String(port), CUBE_OPENHANDS_DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Startup timeout')), 60000);
    child.stdout.on('data', bytes => { if (bytes.toString().includes('OpenHands is ready')) { clearTimeout(timer); resolve(); } });
    child.on('error', reject); child.on('exit', code => { clearTimeout(timer); reject(new Error(`Launcher exited ${code}; diagnostics: ${data}`)); });
  });
  const url = `http://127.0.0.1:${port}`;
  const info = await (await fetch(`${url}/server_info`)).json();
  services = Object.values(info.runtime_services.services).map(service => service.url_from_agent).filter(Boolean);
  const html = await (await fetch(url)).text();
  assert.match(html, /<html/);
  const match = html.match(/window\.__AGENT_CANVAS_SESSION_API_KEY__=("[^"]+")/);
  assert(match, 'upstream local mode injects its own session key without another sign-in');
  // Only test-generated runtime HTML is inspected; never open credential files
  // or print the session value.
  return { url, key: JSON.parse(match[1]) };
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit'); const began = Date.now(); child.kill('SIGHUP');
  const [code] = await done; child = null; assert.equal(code, 0);
  assert(Date.now() - began < 2250, 'shutdown fits Cube termination deadline');
  for (const url of services) await assert.rejects(fetch(url, { signal: AbortSignal.timeout(1000) }), 'upstream services are also stopped');
}
try {
  const first = await launch();
  const headers = { 'X-Session-API-Key': first.key };
  assert.equal((await fetch(`${first.url}/api/conversations/search`, { headers })).status, 200);
  assert.equal((await fetch(`${first.url}/api/automation/v1/capabilities`, { headers })).status, 200);
  const hosted = await new Promise((resolve, reject) => {
    const req = http.get(first.url, { headers: { Host: 'openhands-1234abcd.cube.site', 'X-Forwarded-Proto': 'https' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject);
  });
  assert.equal(hosted, 200);
  assert.equal((await fetch(`${first.url}/api/conversations`, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
  await stop();
  const second = await launch(); assert.equal(second.key, first.key);
  await stop();
  console.log('PASS: OpenHands UI, local session, agent and automation APIs, Cube Host, CSRF, persistent restart and full service shutdown.');
} finally { await stop(); await rm(data, { recursive: true, force: true }); }
