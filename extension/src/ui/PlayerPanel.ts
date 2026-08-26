import * as vscode from 'vscode';
import { ScrimSession } from '../core/ScrimSession';
import { Player } from '../player/Player';

/**
 * PlayerPanel is a Webview that acts as the main control center for playback.
 * It shows the video timeline, play/pause controls, chapter markers,
 * and the floating webcam overlay.
 */
export class PlayerPanel {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private session: ScrimSession,
    private player: Player
  ) {}

  public show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'scrimbaPlayer',
      'Scrimba Player',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(this.context.extensionPath)]
      }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'play': this.player.play(); break;
        case 'pause': this.player.pause(); break;
        case 'seek': this.player.seekTo(message.timeMs); break;
        case 'fork': this.player.fork(); break;
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  public updateTime(timeMs: number): void {
    if (this.panel) {
      this.panel.webview.postMessage({ command: 'updateTime', timeMs });
    }
  }

  private getHtml(): string {
    // In a full implementation, we would use a local Express server to stream
    // the webcam.mp4 and audio.ogg, or load them directly via Webview URIs if small enough.
    // For now, we mock the UI with HTML/CSS.

    const chapters = this.session.events
      .filter(e => e.type === 'chapter')
      .map(e => `<div class="marker chapter" style="left: ${(e.t / (this.session.lessonMeta.durationMs || 1)) * 100}%" title="${(e as any).title}"></div>`)
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; }
          .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
          button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 5px 10px; cursor: pointer; border-radius: 2px; }
          button:hover { background: var(--vscode-button-hoverBackground); }
          .timeline { position: relative; width: 100%; height: 10px; background: var(--vscode-editorWidget-background); border-radius: 5px; cursor: pointer; }
          .progress { position: absolute; top: 0; left: 0; height: 100%; background: var(--vscode-progressBar-background); pointer-events: none; }
          .marker { position: absolute; top: -2px; width: 4px; height: 14px; background: orange; }
          .webcam { width: 150px; height: 150px; background: black; border-radius: 50%; border: 3px solid var(--vscode-focusBorder); margin-top: 20px; display: flex; align-items: center; justify-content: center; }
        </style>
      </head>
      <body>
        <div class="controls">
          <button onclick="post('play')">Play</button>
          <button onclick="post('pause')">Pause</button>
          <button onclick="post('fork')">Fork</button>
          <span id="timeDisplay">0:00</span>
        </div>
        
        <div class="timeline" id="timeline" onclick="seek(event)">
          <div class="progress" id="progress" style="width: 0%;"></div>
          ${chapters}
        </div>

        <div class="webcam">
          <span>Webcam View</span>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const duration = ${this.session.lessonMeta.durationMs || 1};
          
          function post(cmd) {
            vscode.postMessage({ command: cmd });
          }

          function seek(e) {
            const rect = document.getElementById('timeline').getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            vscode.postMessage({ command: 'seek', timeMs: Math.floor(percent * duration) });
          }

          window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'updateTime') {
              const p = (msg.timeMs / duration) * 100;
              document.getElementById('progress').style.width = p + '%';
              
              const totalSec = Math.floor(msg.timeMs / 1000);
              const m = Math.floor(totalSec / 60);
              const s = (totalSec % 60).toString().padStart(2, '0');
              document.getElementById('timeDisplay').innerText = m + ':' + s;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
