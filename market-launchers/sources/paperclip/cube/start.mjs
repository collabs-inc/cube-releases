import os from 'node:os';
import path from 'node:path';
import { mkdir, open, realpath, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { freePort, gateway } from './gateway.mjs';

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const cache = process.env.CUBE_PAPERCLIP_CACHE_DIR || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'cube-paperclip');
const runtime = path.join(cache, '2026.1001.0-1');
const data = process.env.CUBE_PAPERCLIP_DATA_DIR || path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'cube-paperclip');
await mkdir(data, { recursive: true, mode: 0o700 });
const instance = path.join(data, 'instances/default');
await mkdir(instance, { recursive: true, mode: 0o700 });
// Upstream loads this instance-local .env itself. Create the app's own agent
// signing secret once without inspecting or copying machine credentials.
try {
  await writeFile(path.join(instance, '.env'), `PAPERCLIP_AGENT_JWT_SECRET=${randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
} catch (error) { if (error.code !== 'EEXIST') throw error; }
const innerPort = await freePort();
const env = { ...process.env, PORT: String(innerPort), HOST: '127.0.0.1', PAPERCLIP_HOME: data,
  PAPERCLIP_INSTANCE_ID: 'default', PAPERCLIP_DEPLOYMENT_MODE: 'local_trusted', PAPERCLIP_BIND: 'loopback',
  PAPERCLIP_CONFIG: path.join(data, 'instances/default/config.json'), PAPERCLIP_MIGRATION_AUTO_APPLY: 'true',
  PAPERCLIP_MIGRATION_PROMPT: 'never', PAPERCLIP_UI_DEV_MIDDLEWARE: 'false', SERVE_UI: 'true',
  PAPERCLIP_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' };
// Do not let unrelated shell/database/development settings redirect this app.
for (const name of ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'PAPERCLIP_PUBLIC_URL', 'PAPERCLIP_AUTH_PUBLIC_BASE_URL', 'PAPERCLIP_BIND_HOST', 'PAPERCLIP_MANAGED_RUNTIME_PUBLIC_URL']) delete env[name];
const log = await open(path.join(data, 'cube-runtime.log'), 'a', 0o600);
const child = spawn(process.execPath, [await realpath(path.join(runtime, 'node_modules/@paperclipai/server/dist/index.js'))], {
  cwd: data, env, stdio: ['ignore', log.fd, log.fd], detached: true,
});
await log.close();
const proxy = gateway(innerPort);
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  proxy.close();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit').catch(() => {});
    child.kill('SIGTERM');
    const force = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 15000);
    await exited; clearTimeout(force);
  }
  process.exit(code);
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => void stop());
child.on('error', () => { console.error('Cannot launch Paperclip; run install.'); void stop(1); });
child.on('exit', () => { if (!stopping) { console.error(`Paperclip exited; see ${path.join(data, 'cube-runtime.log')}.`); void stop(1); } });
try {
  let ready = false;
  const deadline = Date.now() + 50000;
  while (Date.now() < deadline) {
    try { ready = (await fetch(`http://127.0.0.1:${innerPort}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(200);
  }
  if (!ready) throw new Error('Paperclip did not become ready in 50 seconds.');
  proxy.server.listen(port, '127.0.0.1');
  await once(proxy.server, 'listening');
  console.log(`Paperclip is ready on 127.0.0.1:${port}.`);
} catch (error) { console.error(error.message); await stop(1); }
