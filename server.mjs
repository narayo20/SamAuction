import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      send(res, 405, '405 Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      send(res, 400, '400 Bad Request');
      return;
    }

    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/favicon.ico') {
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    const filePath = path.resolve(ROOT, `.${pathname}`);
    const relative = path.relative(ROOT, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      send(res, 403, '403 Forbidden');
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      send(res, 404, '404 Not Found — 샘옥션클래스 프로토타입');
      return;
    }

    const headers = {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) send(res, 500, '500 Internal Server Error');
      else res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    console.error('[server]', error);
    if (!res.headersSent) send(res, 500, '500 Internal Server Error');
    else res.destroy();
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`포트 ${PORT}가 이미 사용 중입니다. PORT=4174 node server.mjs 처럼 다른 포트를 지정해 주세요.`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  샘옥션클래스 — SamAuction prototype');
  console.log(`  http://${HOST}:${PORT}`);
  console.log('  모든 결제는 모의 결제이며 실제 금액이 청구되지 않습니다.');
  console.log('');
});
