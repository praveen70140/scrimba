import * as vscode from 'vscode';
import * as path from 'path';

export class WebviewManager {
  private panel: vscode.WebviewPanel | undefined;

  public showBrowser(context: vscode.ExtensionContext, initialUrl: string = 'http://localhost:3000') {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'scrimBrowserPreview',
      'Preview',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = this.getWebviewContent(initialUrl);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    }, null, context.subscriptions);
  }

  public navigate(url: string) {
    if (this.panel) {
      this.panel.webview.html = this.getWebviewContent(url);
    }
  }

  private escapeHtml(unsafe: string) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private getWebviewContent(rawUrl: string) {
    let url = '';
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        url = parsed.href;
      } else {
        url = 'about:blank';
      }
    } catch {
      url = 'about:blank';
    }
    
    const safeUrl = this.escapeHtml(url);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:*; style-src 'unsafe-inline';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <style>
      body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background-color: #ffffff; }
      iframe { width: 100%; height: 100%; border: none; }
      .address-bar { padding: 8px; background: #333; display: flex; color: white; font-family: sans-serif; font-size: 13px;}
      .address-bar input { flex-grow: 1; margin-left: 8px; background: #555; color: white; border: 1px solid #666; border-radius: 4px; padding: 4px 8px; }
    </style>
</head>
<body>
    <div class="address-bar">
      <span>🌐</span>
      <input type="text" readonly value="${safeUrl}" />
    </div>
    <iframe src="${safeUrl}"></iframe>
</body>
</html>`;
  }
}
