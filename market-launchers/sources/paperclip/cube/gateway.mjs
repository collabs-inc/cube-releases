import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';

export async function freePort() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

// Cube authenticates requests before they reach this loopback adapter. Also
// reject browser CSRF and DNS rebinding if a browser can reach the raw port.
export function allowed(req, websocket = false) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  let url;
  try { url = new URL(`http://${req.headers.host}`); } catch { return false; }
  if (url.host !== req.headers.host || url.username || url.password) return false;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !/^[a-z0-9][a-z0-9-]*-[a-z0-9]{8}(?:-stg)?\.cube\.site$/.test(url.hostname)) return false;
  const origin = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;
  if (req.headers.origin && req.headers.origin !== origin) return false;
  if (websocket && req.headers.origin !== origin) return false;
  const unsafe = websocket || !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) {
    // Service workers forwarding an iframe navigation preserve navigate mode
    // but send an empty destination. Scripts cannot set this browser-controlled
    // mode on ordinary fetches, so it does not admit cross-site API requests.
    const workerNavigation = req.method === 'GET' && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'empty';
    if (unsafe || (!['document', 'iframe'].includes(req.headers['sec-fetch-dest']) && !workerNavigation)) return false;
  }
  return true;
}

export function gateway(innerPort) {
  const server = http.createServer();
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('request', (req, res) => {
    if (!allowed(req)) { res.writeHead(403); res.end('Forbidden'); return; }
    const proxy = http.request({ host: '127.0.0.1', port: innerPort, method: req.method, path: req.url, headers: req.headers }, upstream => {
      const headers = { ...upstream.headers };
      delete headers['access-control-allow-origin'];
      delete headers['access-control-allow-credentials'];
      res.writeHead(upstream.statusCode, headers);
      upstream.pipe(res);
    });
    proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('App server unavailable'); });
    req.on('aborted', () => proxy.destroy());
    res.on('close', () => proxy.destroy());
    req.pipe(proxy);
  });
  server.on('upgrade', (req, socket, head) => {
    if (!allowed(req, true)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    const proxy = http.request({ host: '127.0.0.1', port: innerPort, method: 'GET', path: req.url, headers: req.headers });
    proxy.on('upgrade', (response, remote, remoteHead) => {
      sockets.add(remote); remote.on('close', () => sockets.delete(remote));
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
      if (head.length) remote.write(head);
      if (remoteHead.length) socket.write(remoteHead);
      remote.on('error', () => socket.destroy()); socket.on('error', () => remote.destroy());
      socket.on('close', () => remote.destroy());
      remote.pipe(socket).pipe(remote);
    });
    proxy.on('response', response => { socket.end(`HTTP/1.1 ${response.statusCode} Upstream Rejected\r\nConnection: close\r\n\r\n`); response.resume(); });
    proxy.on('error', () => socket.destroy());
    proxy.end();
  });
  return { server, close() { server.close(); for (const socket of sockets) socket.destroy(); } };
}
