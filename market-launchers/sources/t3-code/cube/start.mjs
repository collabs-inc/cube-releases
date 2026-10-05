import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { mkdir } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const run = promisify(execFile);
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const home = os.homedir();
const binary = path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'cube-t3code/runtime/versions/0.0.45/t3');
const data = process.env.CUBE_T3_DATA_DIR || path.join(process.env.XDG_DATA_HOME || path.join(home, '.local/share'), 'cube-t3code');
await mkdir(data, { recursive: true, mode: 0o700 });
const env = { ...process.env, T3CODE_TELEMETRY_ENABLED: 'false', PATH: `${path.join(home, '.local/bin')}:${process.env.PATH || ''}` };
// An ambient development URL would replace the bundled app and send users to a different server.
delete env.VITE_DEV_SERVER_URL;
delete env.T3CODE_DEV_AUTH_TOKEN;
delete env.T3CODE_TAILSCALE_SERVE;

const reservation = net.createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const innerPort = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const upstream = `http://127.0.0.1:${innerPort}`;
const child = spawn(binary, ['serve', '--host', '127.0.0.1', '--port', String(innerPort), '--base-dir', data], {
  env, stdio: ['ignore', 'pipe', 'pipe'],
});
// Upstream prints one-time pairing credentials and a QR code. Keep these out of Cube's logs.
// T3's own diagnostic logs remain in its data directory.
child.stdout.resume();
child.stderr.resume();
let childExited = false;
let stopping = false;
let session;
let renewal;
const sockets = new Set();
const server = http.createServer();

async function auth(...args) {
  return run(binary, ['auth', 'session', ...args, '--base-dir', data], { env, timeout: 20000, maxBuffer: 1024 * 1024 });
}
async function renew() {
  const previous = session;
  const result = await auth('issue', '--ttl', '48h', '--label', 'Cube app gateway', '--json');
  const next = JSON.parse(result.stdout);
  if (!next.token || !next.sessionId) throw new Error('T3 did not issue a gateway session.');
  session = next;
  if (previous) await auth('revoke', previous.sessionId).catch(() => {});
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(renewal);
  server.close();
  for (const socket of sockets) socket.destroy();
  if (session) await auth('revoke', session.sessionId).catch(() => {});
  if (!childExited) {
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    await once(child, 'exit').catch(() => {});
    clearTimeout(force);
  }
  process.exit(code);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
child.on('error', () => { childExited = true; console.error('Unable to launch the T3 runtime; run the app install step.'); void stop(1); });
child.on('exit', code => { childExited = true; if (!stopping) { console.error(`T3 server exited (${code ?? 'signal'}).`); void stop(1); } });

// Cube's authenticated gate is the public boundary. This extra loopback check also protects
// the adapter's raw port from browser CSRF and DNS rebinding on desktop installations.
function allowed(req, websocket = false) {
  const peer = req.socket.remoteAddress;
  if (peer !== '127.0.0.1' && peer !== '::1' && peer !== '::ffff:127.0.0.1') return false;
  let url;
  try { url = new URL(`http://${req.headers.host}`); } catch { return false; }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !/^[a-z0-9][a-z0-9-]*-[a-z0-9]{8}(?:-stg)?\.cube\.site$/.test(url.hostname)) return false;
  const unsafe = websocket || !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  if (req.headers.origin && req.headers.origin !== `${proto}://${req.headers.host}`) return false;
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) {
    // Cube's frame navigation crosses origins; its API reads must remain same-origin.
    if (unsafe || !['document', 'iframe'].includes(req.headers['sec-fetch-dest'])) return false;
  }
  return true;
}
function headers(req) {
  return { ...req.headers, authorization: `Bearer ${session.token}` };
}
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
server.on('request', (req, res) => {
  if (!allowed(req)) { res.writeHead(403); res.end('Forbidden'); return; }
  const proxy = http.request({ host: '127.0.0.1', port: innerPort, method: req.method, path: req.url, headers: headers(req) }, response => {
    const responseHeaders = { ...response.headers };
    delete responseHeaders['access-control-allow-origin'];
    delete responseHeaders['access-control-allow-credentials'];
    res.writeHead(response.statusCode, responseHeaders);
    response.pipe(res);
  });
  proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('T3 server unavailable'); });
  req.on('aborted', () => proxy.destroy());
  res.on('close', () => proxy.destroy());
  req.pipe(proxy);
});
server.on('upgrade', (req, socket, head) => {
  if (!allowed(req, true)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
  const proxy = http.request({ host: '127.0.0.1', port: innerPort, method: 'GET', path: req.url, headers: headers(req) });
  proxy.on('upgrade', (response, remote, remoteHead) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
    if (head.length) remote.write(head);
    if (remoteHead.length) socket.write(remoteHead);
    remote.on('error', () => socket.destroy());
    socket.on('error', () => remote.destroy());
    socket.on('close', () => remote.destroy());
    remote.pipe(socket).pipe(remote);
  });
  proxy.on('response', response => { socket.end(`HTTP/1.1 ${response.statusCode} Upstream Rejected\r\nConnection: close\r\n\r\n`); response.resume(); });
  proxy.on('error', () => socket.destroy());
  proxy.end();
});

try {
  const deadline = Date.now() + 45000;
  let ready = false;
  while (!childExited && Date.now() < deadline) {
    try { ready = (await fetch(`${upstream}/.well-known/t3/environment`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(200);
  }
  if (!ready) throw new Error('T3 server did not become ready.');
  await renew();
  renewal = setInterval(() => { void renew().catch(() => { console.error('Could not renew the T3 gateway session; restarting.'); void stop(1); }); }, 24 * 60 * 60 * 1000);
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  console.log(`T3 Code is ready on 127.0.0.1:${port}.`);
} catch {
  console.error('Could not start T3 Code. Check its diagnostic logs in the Cube T3 data directory.');
  await stop(1);
}
