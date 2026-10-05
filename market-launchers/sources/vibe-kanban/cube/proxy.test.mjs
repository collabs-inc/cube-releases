import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';

test('local landing redirects only root and preserves native HTTP/WebSocket hosts', async () => {
  const { localLandingProxy } = await import('./proxy.mjs');
  const upstream = http.createServer((req, res) => res.end(`${req.url}|${req.headers.host}`));
  upstream.on('upgrade', (req, socket) => {
    assert.equal(req.headers.host, 'vibe-abcdefgh.cube.site');
    socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const proxy = localLandingProxy(upstream.address().port);
  proxy.server.listen(0, '127.0.0.1'); await once(proxy.server, 'listening');
  const port = proxy.server.address().port;
  const request = (route, headers = {}) => new Promise((resolve, reject) => {
    const req = http.get({host:'127.0.0.1',port,path:route,headers:{Host:'vibe-abcdefgh.cube.site',...headers}}, res => {
      let body='';res.on('data', chunk => body+=chunk);res.on('end',()=>resolve({code:res.statusCode,location:res.headers.location,body}));
    }); req.on('error',reject);
  });
  try {
    assert.deepEqual(await request('/'), {code:302,location:'/workspaces',body:''});
    assert.equal((await request('/workspaces')).body, '/workspaces|vibe-abcdefgh.cube.site');
    assert.equal((await request('/api/info')).code, 200);
    assert.equal((await request('/workspaces',{Origin:'https://evil.example'})).code, 403);
    const result = await new Promise((resolve, reject) => {
      const req = http.request({host:'127.0.0.1',port,path:'/api/workspaces/streams',headers:{Host:'vibe-abcdefgh.cube.site',Origin:'https://vibe-abcdefgh.cube.site','X-Forwarded-Proto':'https',Connection:'Upgrade',Upgrade:'websocket'}});
      req.on('upgrade',(res,socket)=>{socket.destroy();resolve(res.statusCode)});req.on('error',reject);req.end();
    });
    assert.equal(result,101);
  } finally {await proxy.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
});
