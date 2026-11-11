import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

export class LocalServer {
  private server: http.Server | null = null;
  public port = 0;

  public async start(lessonDir: string): Promise<number> {
    this.stop();
    const root = path.resolve(lessonDir);
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        try {
          const parsed = new URL(req.url || '/', 'http://127.0.0.1');
          let pathname = decodeURIComponent(parsed.pathname);
          if (pathname === '/') pathname = '/screen.mp4';
          const filePath = path.resolve(root, `.${pathname}`);
          if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
            res.writeHead(403); res.end('Forbidden'); return;
          }
          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            res.writeHead(404); res.end('Not found'); return;
          }
          const stat = fs.statSync(filePath);
          const range = req.headers.range;
          const contentType = pathname.endsWith('.webm') ? 'video/webm' : pathname.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream';
          const headers: Record<string, string | number> = {
            'Accept-Ranges': 'bytes', 'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin',
          };
          if (!range) {
            res.writeHead(200, { ...headers, 'Content-Length': stat.size });
            fs.createReadStream(filePath).pipe(res); return;
          }
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return; }
          const isSuffix = !match[1] && !!match[2];
          const start = isSuffix ? Math.max(0, stat.size - Number(match[2])) : (match[1] ? Number(match[1]) : 0);
          const end = isSuffix ? stat.size - 1 : (match[2] ? Number(match[2]) : stat.size - 1);
          if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= stat.size) {
            res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return;
          }
          const safeEnd = Math.min(end, stat.size - 1);
          res.writeHead(206, {
            ...headers, 'Content-Range': `bytes ${start}-${safeEnd}/${stat.size}`,
            'Content-Length': safeEnd - start + 1,
          });
          fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
        } catch (error) {
          console.error('[LocalServer]', error);
          if (!res.headersSent) res.writeHead(500);
          res.end('Internal server error');
        }
      });
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        if (!address || typeof address !== 'object') return reject(new Error('Failed to get local server port'));
        this.port = address.port;
        resolve(this.port);
      });
    });
  }

  public stop(): void {
    this.server?.close();
    this.server = null;
    this.port = 0;
  }
}
