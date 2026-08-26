import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ScreenCapture {
  private panel: vscode.WebviewPanel | undefined;
  private writeStream: fs.WriteStream | undefined;
  private isRecordingState: boolean = false;

  public async start(outputDir: string): Promise<void> {
    const outputPath = path.join(outputDir, 'screen.webm'); // WebRTC uses webm
    this.writeStream = fs.createWriteStream(outputPath);

    this.panel = vscode.window.createWebviewPanel(
      'webrtcRecorder',
      'Select Screen to Record',
      vscode.ViewColumn.Beside, // Show beside so user can click the permission prompt
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage((message) => {
      if (message.command === 'chunk') {
        const buffer = Buffer.from(message.data, 'base64');
        this.writeStream?.write(buffer);
      } else if (message.command === 'started') {
        this.isRecordingState = true;
        vscode.window.showInformationMessage('Screen recording started. You can minimize this tab during recording.');
      } else if (message.command === 'error') {
        vscode.window.showErrorMessage('Screen recording failed: ' + message.text);
      }
    });
  }

  public async stop(): Promise<void> {
    if (this.panel) {
      this.panel.webview.postMessage({ command: 'stop' });
      // Give it a second to flush final chunks
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.panel.dispose();
      this.panel = undefined;
    }
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = undefined;
    }
    this.isRecordingState = false;
  }

  public get isRecording(): boolean {
    return this.isRecordingState;
  }

  private getHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>WebRTC Recorder</title>
      </head>
      <body style="background: black; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; text-align: center;">
        <div>
          <h2>Recording Screen in Background...</h2>
          <p>Please select the screen you wish to record in the prompt above.</p>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          let mediaRecorder;

          async function start() {
            try {
              const stream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { frameRate: 30 },
                audio: false
              });

              mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

              mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0) {
                  const buffer = await e.data.arrayBuffer();
                  // Convert ArrayBuffer to Base64 to send over postMessage safely
                  let binary = '';
                  const bytes = new Uint8Array(buffer);
                  for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                  }
                  const base64 = btoa(binary);
                  vscode.postMessage({ command: 'chunk', data: base64 });
                }
              };

              // Request data every 1 second
              mediaRecorder.start(1000);
              vscode.postMessage({ command: 'started' });

            } catch (err) {
              vscode.postMessage({ command: 'error', text: err.toString() });
            }
          }

          window.addEventListener('message', event => {
            if (event.data.command === 'stop') {
              if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
              }
            }
          });

          // Auto-start when loaded
          start();
        </script>
      </body>
      </html>
    `;
  }
}
