import * as vscode from 'vscode';
import { ScrimSession } from '../core/ScrimSession';
import { Player } from '../player/Player';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

export class PlayerPanel {
  private panel: vscode.WebviewPanel | undefined;
  private mediaServer: http.Server | undefined;
  private mediaPort: number = 0;

  constructor(
    private context: vscode.ExtensionContext,
    private session: ScrimSession,
    private player: Player
  ) {}

  public async show(lessonDir: string): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    // Start a temporary HTTP server to serve the video, bypassing VS Code's buggy Webview protocols
    await this.startMediaServer(lessonDir);

    this.panel = vscode.window.createWebviewPanel(
      'scrimbaPlayer',
      'Scrimba Player',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(this.context.extensionPath),
          vscode.Uri.file(lessonDir)
        ]
      }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'play': this.player.play(); break;
        case 'pause': this.player.pause(); break;
        case 'seek': this.player.seekTo(message.timeMs); break;
        case 'fork': 
          this.session.currentTimeMs = message.timeMs;
          this.player.fork(); 
          break;
        case 'timeupdate':
          this.session.currentTimeMs = message.timeMs;
          break;
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.stopMediaServer();
    });
  }

  public dispose(): void {
    this.panel?.dispose();
    this.stopMediaServer();
  }

  public playVideo(): void {
    if (this.panel) this.panel.webview.postMessage({ command: 'play' });
  }

  public pauseVideo(): void {
    if (this.panel) this.panel.webview.postMessage({ command: 'pause' });
  }

  public seekVideo(timeMs: number): void {
    if (this.panel) this.panel.webview.postMessage({ command: 'seek', timeMs });
  }

  private startMediaServer(lessonDir: string): Promise<void> {
    return new Promise((resolve) => {
      this.mediaServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (req.url === '/screen.webm') {
          const videoPath = path.join(lessonDir, 'screen.webm');
          if (!fs.existsSync(videoPath)) {
            res.writeHead(404);
            return res.end('Not found');
          }
          
          const stat = fs.statSync(videoPath);
          const fileSize = stat.size;
          const range = req.headers.range;

          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(videoPath, {start, end});
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': 'video/webm',
            });
            file.pipe(res);
          } else {
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': 'video/webm',
            });
            fs.createReadStream(videoPath).pipe(res);
          }
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.mediaServer.listen(0, '127.0.0.1', () => {
        this.mediaPort = (this.mediaServer?.address() as any).port;
        resolve();
      });
    });
  }

  private stopMediaServer(): void {
    if (this.mediaServer) {
      this.mediaServer.close();
      this.mediaServer = undefined;
    }
  }

  private getHtml(): string {
    const videoUri = `http://127.0.0.1:${this.mediaPort}/screen.webm`;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src http://127.0.0.1:* https: blob: data: vscode-webview-resource:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
        <style>
          body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; margin: 0; background: black; display: flex; flex-direction: column; height: 100vh; }
          .video-container { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #111; }
          video { max-width: 100%; max-height: 100%; object-fit: contain; }
          .controls { display: flex; gap: 10px; align-items: center; padding: 10px; background: var(--vscode-editorWidget-background); }
          button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 5px 10px; cursor: pointer; border-radius: 2px; }
          button:hover { background: var(--vscode-button-hoverBackground); }
          .timeline-container { padding: 10px; background: var(--vscode-editorWidget-background); }
          .timeline { position: relative; width: 100%; height: 10px; background: var(--vscode-editor-background); border-radius: 5px; cursor: pointer; }
          .progress { position: absolute; top: 0; left: 0; height: 100%; background: var(--vscode-progressBar-background); pointer-events: none; }
        </style>
      </head>
      <body>
        <div class="video-container">
          <video id="vid" src="${videoUri}" controls autoplay></video>
        </div>
        
        <div class="timeline-container">
          <div class="timeline" id="timeline" onclick="seek(event)">
            <div class="progress" id="progress" style="width: 0%;"></div>
          </div>
        </div>

        <div class="controls">
          <button onclick="playVid()">Play</button>
          <button onclick="pauseVid()">Pause</button>
          <button onclick="fork()">Fork Here</button>
          <span id="timeDisplay">0:00</span>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const vid = document.getElementById('vid');
          const duration = ${this.session.lessonMeta.durationMs || 100000};
          
          vid.addEventListener('timeupdate', () => {
            const timeMs = vid.currentTime * 1000;
            const p = (timeMs / duration) * 100;
            document.getElementById('progress').style.width = p + '%';
            
            const totalSec = Math.floor(timeMs / 1000);
            const m = Math.floor(totalSec / 60);
            const s = (totalSec % 60).toString().padStart(2, '0');
            document.getElementById('timeDisplay').innerText = m + ':' + s;

            vscode.postMessage({ command: 'timeupdate', timeMs });
          });

          vid.addEventListener('play', () => vscode.postMessage({ command: 'play' }));
          vid.addEventListener('pause', () => vscode.postMessage({ command: 'pause' }));

          function playVid() { vid.play(); }
          function pauseVid() { vid.pause(); }
          function fork() {
            vid.pause();
            vscode.postMessage({ command: 'fork', timeMs: vid.currentTime * 1000 });
          }

          function seek(e) {
            const rect = document.getElementById('timeline').getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            vid.currentTime = (percent * duration) / 1000;
          }

          window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'play') playVid();
            if (msg.command === 'pause') pauseVid();
            if (msg.command === 'seek') vid.currentTime = msg.timeMs / 1000;
          });
        </script>
      </body>
      </html>
    `;
  }
}
