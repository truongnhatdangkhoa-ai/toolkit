#!/usr/bin/env node
// Chạy thử giao diện web trên máy:  npm run serve  ->  http://localhost:8080
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { ROOT } from './lib.mjs';
const WWW = path.join(ROOT, 'www'), port = +(process.env.PORT || 8080);
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(WWW, path.normalize(p));
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(r);
}).listen(port, () => console.log('http://localhost:' + port));
