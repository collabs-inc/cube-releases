import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { mkdir, open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { freePort, gateway } from './gateway.mjs';

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const home = os.homedir();
const cache = process.env.CUBE_OPENHANDS_CACHE_DIR || path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'cube-openhands');
const runtime = path.join(cache, '1.24.0-2');
const data = process.env.CUBE_OPENHANDS_DATA_DIR || path.join(process.env.XDG_DATA_HOME || path.join(home, '.local/share'), 'cube-openhands');
await mkdir(data, { recursive: true, mode: 0o700 });
const state = path.join(data, 'agent-canvas');
await mkdir(state, { recursive: true, mode: 0o700 });
// Upstream derives the editor port from the agent port. Check that pair as
// well as independently chosen ports for its ingress, frontend and automation.
let backendPort;
for (;;) {
  backendPort = await freePort();
  if (backendPort > 64535 || backendPort === port || backendPort + 1000 === port) continue;
  const check = net.createServer();
  try {
    check.listen(backendPort + 1000, '127.0.0.1');
    await once(check, 'listening'); await new Promise(resolve => check.close(resolve)); break;
  } catch { check.close(); }
}
const taken = new Set([port, backendPort, backendPort + 1000]);
async function nextPort() { for (;;) { const n = await freePort(); if (!taken.has(n)) { taken.add(n); return n; } } }
const innerPort = await nextPort(), automationPort = await nextPort(), frontendPort = await nextPort();
const env = { ...process.env };
// An unrelated development shell must not redirect the packaged stack.
for (const name of Object.keys(env)) if (/^(OH_|OPENHANDS_|AUTOMATION_|VITE_|INGRESS_)/.test(name) || name === 'LOCAL_BACKEND_API_KEY') delete env[name];
Object.assign(env, {
  PORT: String(innerPort), NODE_ENV: 'production', DO_NOT_TRACK: '1', VITE_DO_NOT_TRACK: '1',
  OH_CANVAS_SAFE_STATE_DIR: state, OH_SESSION_API_KEY_PATH: path.join(state, 'api-key.txt'),
  OH_SECRET_KEY_PATH: path.join(state, 'secret-key.txt'),
  OH_CANVAS_SAFE_BACKEND_PORT: String(backendPort), OH_CANVAS_SAFE_AUTOMATION_PORT: String(automationPort),
  OH_CANVAS_SAFE_VITE_PORT: String(frontendPort), OH_CONVERSATION_RUNTIME: 'local',
  VITE_WORKING_DIR: path.join(home, 'repos'),
});
const log = await open(path.join(data, 'cube-runtime.log'), 'a', 0o600);
const child = spawn(process.execPath, [path.join(runtime, 'node_modules/@openhands/agent-canvas/bin/agent-canvas.mjs')], {
  cwd: data, env, stdio: ['ignore', log.fd, log.fd], detached: true,
});
await log.close();
let ready = false;
const proxy = gateway(innerPort, () => ready);
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true; proxy.close();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit').catch(() => {}); child.kill('SIGTERM');
    const force = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1800);
    await exited; clearTimeout(force);
  }
  process.exit(code);
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => void stop());
child.on('error', () => { console.error('Cannot launch OpenHands; run install.'); void stop(1); });
child.on('exit', () => { if (!stopping) { console.error(`OpenHands exited; see ${path.join(data, 'cube-runtime.log')}.`); void stop(1); } });
try {
  proxy.server.listen(port, '127.0.0.1'); await once(proxy.server, 'listening');
  console.log('Starting OpenHands services (up to five minutes on a cold volume)...');
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    try {
      ready = (await fetch(`http://127.0.0.1:${innerPort}/server_info`, { signal: AbortSignal.timeout(1000) })).ok &&
        (await fetch(`http://127.0.0.1:${innerPort}/api/automation/openapi.json`, { signal: AbortSignal.timeout(1000) })).ok &&
        (await fetch(`http://127.0.0.1:${innerPort}/`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {}
    if (ready) break;
    await delay(200);
  }
  if (!ready) throw new Error(`OpenHands did not become ready; see ${path.join(data, 'cube-runtime.log')}.`);
  console.log(`OpenHands is ready on 127.0.0.1:${port}.`);
} catch (error) { console.error(error.message); await stop(1); }
