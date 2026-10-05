import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { gateway } from './gateway.mjs';

test('Cube gateway forwards HTTP and WebSockets and rejects foreign origins', async () => {
  const upstream = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ host: req.headers.host, path: req.url })); });
  upstream.on('upgrade', (_req, socket) => { socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n'); });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const proxy = gateway(upstream.address().port);
  proxy.server.listen(0, '127.0.0.1'); await once(proxy.server, 'listening');
  const port = proxy.server.address().port;
  const host = 'app-1234abcd.cube.site';
  async function request({ method = 'GET', headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/example', method, headers: { Host: host, 'X-Forwarded-Proto': 'https', ...headers } }, res => {
        let body = ''; res.on('data', data => body += data); res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('upgrade', (res, socket) => { socket.destroy(); resolve({ status: res.statusCode }); });
      req.on('error', reject); req.end();
    });
  }
  try {
    assert.deepEqual(JSON.parse((await request()).body), { host, path: '/api/example' });
    assert.equal((await request({ method: 'POST', headers: { Origin: `https://${host}` } })).status, 200);
    assert.equal((await request({ method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await request({ headers: { Host: 'evil.example' } })).status, 403);
    assert.equal((await request({ headers: { 'Sec-Fetch-Site': 'same-site' } })).status, 403);
    assert.equal((await request({ headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': 'iframe' } })).status, 200);
    // A controlling service worker's fetch(event.request) retains navigation
    // mode but Chromium changes the original iframe destination to empty.
    const workerNavigation = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'empty' };
    assert.equal((await request({ headers: workerNavigation })).status, 200, 'service-worker iframe navigation');
    assert.equal((await request({ headers: { ...workerNavigation, 'Sec-Fetch-Site': 'same-site' } })).status, 200);
    assert.equal((await request({ headers: { ...workerNavigation, 'Sec-Fetch-Mode': 'cors' } })).status, 403);
    assert.equal((await request({ headers: { ...workerNavigation, 'Sec-Fetch-Mode': 'no-cors' } })).status, 403);
    assert.equal((await request({ headers: { ...workerNavigation, Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await request({ method: 'POST', headers: workerNavigation })).status, 403);
    assert.equal((await request({ method: 'OPTIONS', headers: workerNavigation })).status, 403);
    assert.equal((await request({ headers: { Connection: 'Upgrade', Upgrade: 'test', Origin: `https://${host}` } })).status, 101);
    assert.equal((await request({ headers: { Connection: 'Upgrade', Upgrade: 'test', Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await request({ headers: { Connection: 'Upgrade', Upgrade: 'test' } })).status, 403);
  } finally { proxy.close(); await new Promise(resolve => upstream.close(resolve)); }
});
