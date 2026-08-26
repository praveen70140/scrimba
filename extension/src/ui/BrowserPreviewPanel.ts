import * as vscode from 'vscode';
import { ScrimSession } from '../core/ScrimSession';

/**
 * BrowserPreviewPanel manages the Webview that shows either:
 * - The recorded browser-preview.mp4 (during playback)
 * - A live iframe to localhost (during active recording or when editing a fork)
 */
export class BrowserPreviewPanel {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private session: ScrimSession
  ) {}

  public showLive(url: string): void {
    this.createPanel();
    this.panel!.title = 'Browser (Live)';
    this.panel!.webview.html = this.getLiveHtml(url);
  }

  public showRecordedVideo(): void {
    this.createPanel();
    this.panel!.title = 'Browser (Recorded)';
    // In a real implementation we would stream the mp4
    this.panel!.webview.html = `
      <body style="margin:0; background:black; display:flex; align-items:center; justify-content:center; height:100vh;">
        <h1 style="color:white;">Recorded Browser Video</h1>
      </body>
    `;
  }

  private createPanel(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'scrimbaBrowser',
      'Browser',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private getLiveHtml(urlStr: string): string {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      return `<body>Invalid URL</body>`;
    }
    
    // Simple HTML escape
    const escapeHtml = (unsafe: string) => unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
         
    const safeUrl = escapeHtml(parsedUrl.href);

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${safeUrl}; style-src 'unsafe-inline';">
        <style>
          body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: white; }
          iframe { width: 100%; height: 100%; border: none; }
          .header { background: #eee; padding: 5px; font-family: sans-serif; display: flex; align-items: center; border-bottom: 1px solid #ccc; }
          .url-bar { background: white; border: 1px solid #ccc; padding: 4px; border-radius: 4px; flex: 1; margin: 0 10px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <span>🔄</span>
          <div class="url-bar">${safeUrl}</div>
        </div>
        <iframe src="${safeUrl}"></iframe>
      </body>
      </html>
    `;
  }
}
