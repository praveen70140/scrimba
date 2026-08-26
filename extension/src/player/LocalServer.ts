import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class LocalServer {
    private server: http.Server | null = null;
    public port: number = 0;

    public async start(lessonDir: string): Promise<number> {
        if (this.server) {
            this.stop();
        }

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                try {
                    const parsedUrl = new URL(req.url || '/', `http://localhost`);
                    let pathname = parsedUrl.pathname;
                    if (pathname === '/') {
                        pathname = '/screen.webm';
                    }
                    
                    const filePath = path.join(lessonDir, pathname);
                    if (!fs.existsSync(filePath)) {
                        res.writeHead(404);
                        res.end('Not found');
                        return;
                    }

                    const stat = fs.statSync(filePath);
                    const fileSize = stat.size;
                    const range = req.headers.range;

                    if (range) {
                        const parts = range.replace(/bytes=/, "").split("-");
                        const rawStart = parts[0] === '' ? NaN : parseInt(parts[0], 10);
                        const rawEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                        
                        // Suffix range: bytes=-N returns the last N bytes
                        const start = Number.isNaN(rawStart)
                            ? Math.max(0, fileSize - (Number.isNaN(rawEnd) ? fileSize : rawEnd))
                            : rawStart;
                        const end = Math.min(Number.isNaN(rawEnd) ? fileSize - 1 : rawEnd, fileSize - 1);

                        if (start >= fileSize || start > end) {
                            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
                            return res.end();
                        }

                        const chunksize = (end - start) + 1;
                        const file = fs.createReadStream(filePath, { start, end });
                        file.on('error', () => res.destroy());
                        const contentType = pathname.endsWith('.webm') ? 'video/webm' : pathname.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream';
                        const head = {
                            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': chunksize,
                            'Content-Type': contentType,
                            'Access-Control-Allow-Origin': '*',
                            'Cross-Origin-Resource-Policy': 'cross-origin'
                        };

                        res.writeHead(206, head);
                        file.pipe(res);
                    } else {
                        const contentType = pathname.endsWith('.webm') ? 'video/webm' : pathname.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream';
                        const head = {
                            'Content-Length': fileSize,
                            'Content-Type': contentType,
                            'Accept-Ranges': 'bytes',
                            'Access-Control-Allow-Origin': '*',
                            'Cross-Origin-Resource-Policy': 'cross-origin'
                        };
                        res.writeHead(200, head);
                        fs.createReadStream(filePath).pipe(res);
                    }
                } catch (err) {
                    console.error(err);
                    res.writeHead(500);
                    res.end('Internal server error');
                }
            });

            this.server.on('error', reject);

            this.server.listen(0, '127.0.0.1', () => {
                const address = this.server?.address();
                if (address && typeof address === 'object') {
                    this.port = address.port;
                    resolve(this.port);
                } else {
                    reject(new Error('Failed to get port'));
                }
            });
        });
    }

    public stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.port = 0;
        }
    }
}
