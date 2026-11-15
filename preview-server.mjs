import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!target.startsWith(`${root}${sep}`)) throw new Error('invalid path');
    const fileInfo = await stat(target);
    res.writeHead(200, {
      'content-type': types[extname(target)] || (extname(target) === '.mp4' ? 'video/mp4' : 'application/octet-stream'),
      'content-length': fileInfo.size,
      'cache-control': 'no-store',
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(4173, '127.0.0.1', () => process.stdout.write('http://127.0.0.1:4173\n'));
