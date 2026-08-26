import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

export class ScreenCapture {
  private server: http.Server | undefined;
  private writeStream: fs.WriteStream | undefined;
  private writeStreamPath: string | undefined;
  private isRecordingState: boolean = false;

  public async start(outputDir: string): Promise<void> {
    const outputPath = path.join(outputDir, 'screen.webm');
    this.writeStreamPath = outputPath;
    this.writeStream = fs.createWriteStream(outputPath);

    this.server = http.createServer((req, res) => {
      // CORS just in case
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getHtml());
      } else if (req.method === 'POST' && req.url === '/chunk') {
        req.on('data', (chunk) => {
          if (this.writeStream) {
            this.writeStream.write(chunk);
          }
        });
        req.on('end', () => {
          res.writeHead(200);
          res.end('ok');
        });
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(48123, '127.0.0.1', () => {
        // Open the local server in the user's default browser (Chrome/Firefox)
        vscode.env.openExternal(vscode.Uri.parse('http://localhost:48123/'));
        this.isRecordingState = true;
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    this.isRecordingState = false;
    
    // Allow pending queued chunks to finish uploading
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = undefined;

      // Fix WebM metadata (missing duration/index due to streaming chunks)
      try {
        if (this.writeStreamPath) {
          const file = this.writeStreamPath;
          const fixedFile = file.replace('.webm', '_fixed.webm');
          await execPromise(`ffmpeg -y -i "${file}" -c copy "${fixedFile}"`);
          fs.renameSync(fixedFile, file);
          console.log('Fixed WebM metadata successfully');
        }
      } catch (err: any) {
        console.warn('Failed to fix WebM metadata:', err.message);
      }
    }
    
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
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
        <title>Scrimba Clone - Screen Recorder</title>
        <style>
          body { background: #1e1e1e; color: #d4d4d4; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; margin: 0; }
          button { background: #0e639c; color: white; border: none; padding: 15px 30px; font-size: 18px; border-radius: 5px; cursor: pointer; margin-top: 20px; }
          button:hover { background: #1177bb; }
          #status { margin-top: 20px; font-size: 16px; color: #4ec9b0; }
        </style>
      </head>
      <body>
        <h1>Scrimba Screen Recorder</h1>
        <p>Because VS Code blocks screen recording on Wayland, we use your browser!</p>
        <button id="startBtn">Start Recording</button>
        <div id="status"></div>

        <script>
          const btn = document.getElementById('startBtn');
          const status = document.getElementById('status');
          let mediaRecorder;
          let uploadQueue = Promise.resolve();

          btn.addEventListener('click', async () => {
            try {
              const stream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { frameRate: 30 },
                audio: false
              });

              mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

              mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                  uploadQueue = uploadQueue.then(() => 
                    fetch('/chunk', {
                      method: 'POST',
                      body: e.data
                    })
                  ).catch(err => console.error('Failed to send chunk:', err));
                }
              };

              mediaRecorder.onstop = () => {
                // Ensure all uploads finish before we consider it stopped
                uploadQueue.then(() => {
                  status.innerText = "Recording stopped. You can close this tab.";
                  btn.style.display = 'block';
                });
                stream.getTracks().forEach(t => t.stop());
              };

              // Capture a chunk every 1 second
              mediaRecorder.start(1000);
              
              btn.style.display = 'none';
              status.innerText = "Recording... Please minimize this window and return to VS Code.";
              
              // Automatically stop if the user stops sharing via the browser UI
              stream.getVideoTracks()[0].onended = () => {
                if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
              };

            } catch (err) {
              status.innerText = 'Error: ' + err.toString();
              status.style.color = '#f48771';
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
