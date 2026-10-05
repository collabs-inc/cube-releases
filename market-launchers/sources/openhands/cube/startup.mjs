export function startupResponse(req, res, title) {
  if (['GET', 'HEAD'].includes(req.method) && (req.url === '/' || req.headers.accept?.includes('text/html'))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Starting ${title}</title><style>:root{color-scheme:light dark}body{font:16px system-ui;max-width:36rem;margin:15vh auto;padding:2rem;line-height:1.6}h1{font-size:1.5rem}</style><h1>Starting ${title}…</h1><p>The local services are initializing. This page will refresh automatically when they are ready.</p><script>setTimeout(()=>location.reload(),2000)</script>`);
  } else { res.writeHead(503, { 'Retry-After': '2', 'Cache-Control': 'no-store' }); res.end(`${title} is starting.`); }
}
