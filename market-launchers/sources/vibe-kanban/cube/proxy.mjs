import http from 'node:http';

export function localLandingProxy(port) {
  const sockets = new Set();
  const allowed = req => {
    const host = req.headers.host;
    if (typeof host !== 'string' || /[\s/@?#\\]/.test(host)) return false;
    let hostname;
    try { hostname = new URL(`http://${host}`).hostname; } catch { return false; }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname) && !/^[a-z0-9][a-z0-9-]*-[a-z0-9]{8}(?:-stg)?\.cube\.site$/.test(hostname)) return false;
    const scheme = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    return !req.headers.origin || req.headers.origin === `${scheme}://${host}`;
  };
  const server = http.createServer((req, res) => {
    if (!allowed(req)) { res.writeHead(403); res.end(); return; }
    if (req.method === 'GET' && req.url === '/') { res.writeHead(302, {Location:'/workspaces','Cache-Control':'no-store'}); res.end(); return; }
    const remote = http.request({hostname:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers}, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    remote.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Vibe Kanban is starting.');});
    req.on('aborted',()=>remote.destroy()); res.on('close',()=>remote.destroy()); req.pipe(remote);
  });
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  server.on('upgrade',(req,socket,head)=>{
    if (!allowed(req) || !req.headers.origin) {socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    const request = http.request({hostname:'127.0.0.1',port,path:req.url,headers:req.headers});
    request.on('upgrade',(response,remote,remoteHead)=>{
      sockets.add(remote);remote.on('close',()=>sockets.delete(remote));
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${response.rawHeaders.reduce((result,value,index,all)=>index%2?result:`${result}${value}: ${all[index+1]}\r\n`,'')}\r\n`);
      if(head.length)remote.write(head);if(remoteHead.length)socket.write(remoteHead);
      socket.on('error',()=>remote.destroy());remote.on('error',()=>socket.destroy());
      socket.on('close',()=>remote.destroy());remote.on('close',()=>socket.destroy());
      socket.pipe(remote).pipe(socket);
    });
    request.on('response',response=>{response.resume();socket.end(`HTTP/1.1 ${response.statusCode} Upstream response\r\nConnection: close\r\n\r\n`);});
    request.on('error',()=>socket.destroy());socket.on('close',()=>request.destroy());request.end();
  });
  return {server,async close(){for(const socket of sockets)socket.destroy();if(server.listening)await new Promise(resolve=>server.close(resolve));}};
}
