import * as vscode from 'vscode';
import { ScrimSession } from '../core/ScrimSession';
import { Player } from '../player/Player';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Paths } from '../utils/Paths';
import { LocalServer } from '../player/LocalServer';

export class PlayerPanel {
  private panel: vscode.WebviewPanel | undefined;
  private server: LocalServer;

  constructor(
    private context: vscode.ExtensionContext,
    private session: ScrimSession,
    private player: Player
  ) {
    this.server = new LocalServer();
  }

  public async show(lessonDir: string): Promise<void> {
    const port = await this.server.start(lessonDir);

    let forks: any[] = [];
    try {
      const forksDir = Paths.getForksDir(this.session.lessonMeta.id);
      const forkDirs = await fs.readdir(forksDir, { withFileTypes: true });
      for (const f of forkDirs) {
        if (f.isDirectory()) {
          try {
            const meta = JSON.parse(await fs.readFile(path.join(forksDir, f.name, '.fork-meta.json'), 'utf-8'));
            if (typeof meta.timestamp_ms === 'number' && Number.isFinite(meta.timestamp_ms)) {
              forks.push({ id: f.name, t: meta.timestamp_ms, label: meta.label || f.name });
            }
          } catch {}
        }
      }
    } catch {}

    if (this.panel) {
      this.panel.webview.html = this.getHtml(port, lessonDir, forks);
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'scrimbaPlayer',
      'Scrimba Player',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(this.context.extensionPath),
          vscode.Uri.file(lessonDir)
        ]
      }
    );

    this.panel.webview.html = this.getHtml(port, lessonDir, forks);

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
          this.player.updateTime(message.timeMs);
          break;
        case 'ended': {
          vscode.window.showInformationMessage(
            'You finished this lesson!', 
            'Mark Complete', 
            'Next Lesson'
          ).then(choice => {
            if (choice === 'Mark Complete' || choice === 'Next Lesson') {
              vscode.commands.executeCommand('scrim.markComplete', this.session.lessonMeta.courseId, this.session.lessonMeta.id);
            }
          });
          break;
        }
        case 'openFork': {
          const forkPath = path.join(Paths.getForksDir(this.session.lessonMeta.id), message.forkId);
          vscode.commands.executeCommand('scrim.openFork', vscode.Uri.file(forkPath));
          break;
        }
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.server.stop();
    });
  }

  public dispose(): void {
    this.panel?.dispose();
    this.server.stop();
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

  private getHtml(port: number, lessonDir: string, forks: any[]): string {
    const videoUri = `http://127.0.0.1:${port}/screen.mp4?t=${Date.now()}`;
    const audioUri = `http://127.0.0.1:${port}/audio.ogg?t=${Date.now()}`;
    const webcamUri = `http://127.0.0.1:${port}/webcam.mp4?t=${Date.now()}`;
    const cspSource = this.panel!.webview.cspSource;

    const chapters = this.session.events.filter(e => e.type === 'chapter');
    const challenges = this.session.events.filter(e => e.type === 'challenge');
    
    const duration = this.session.lessonMeta.durationMs || 100000;
    const startTimeMs = this.session.lessonMeta.screenStartMs || 0;

    const serializeForInlineScript = (value: unknown): string =>
      JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src http://127.0.0.1:${port} ${cspSource} https: vscode-webview-resource: blob: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
        <style>
          :root { --accent: #e44d26; --bg: #111; --panel: var(--vscode-editorWidget-background); --fg: var(--vscode-foreground); }
          body { font-family: var(--vscode-font-family); color: var(--fg); padding: 0; margin: 0; background: black; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
          .video-container { flex: 1; display: flex; align-items: center; justify-content: center; background: var(--bg); position: relative; }
          video#vid { width: 100%; height: 100%; object-fit: contain; outline: none; }
          video#webcam { position: absolute; bottom: 80px; right: 20px; width: 240px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 10; background: #000; pointer-events: none; }
          audio { display: none; }
          
          /* Controls Overlay */
          .controls-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.85)); padding: 10px 20px; opacity: 0; transition: opacity 0.3s; display: flex; flex-direction: column; gap: 8px; z-index: 20; }
          .video-container:hover .controls-overlay, .controls-overlay.active { opacity: 1; }
          
          /* Timeline */
          .timeline-wrapper { position: relative; height: 20px; display: flex; align-items: center; cursor: pointer; }
          .timeline-track { position: relative; width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; transition: height 0.1s; }
          .timeline-wrapper:hover .timeline-track { height: 6px; }
          .timeline-progress { position: absolute; left: 0; top: 0; height: 100%; background: var(--accent); border-radius: 2px; pointer-events: none; }
          .timeline-thumb { position: absolute; top: 50%; width: 12px; height: 12px; background: var(--accent); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; display: none; }
          .timeline-wrapper:hover .timeline-thumb { display: block; }

          /* Markers */
          .marker { position: absolute; top: 50%; transform: translate(-50%, -50%); cursor: pointer; z-index: 2; }
          .marker.chapter { width: 4px; height: 10px; background: #fff; border-radius: 2px; }
          .marker.challenge { width: 8px; height: 8px; background: #FFD700; transform: translate(-50%, -50%) rotate(45deg); }
          .marker.fork { width: 8px; height: 8px; background: #9b59b6; border-radius: 50%; }

          /* Tooltip */
          .tooltip { position: absolute; bottom: 100%; margin-bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.9); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 12px; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.2s; border: 1px solid rgba(255,255,255,0.1); z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 6px; }
          .tooltip::after { content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 12px; background: transparent; }
          .marker:hover .tooltip, .tooltip:hover { opacity: 1; pointer-events: auto; }
          
          /* Control Buttons */
          .controls-row { display: flex; align-items: center; justify-content: space-between; }
          .controls-left, .controls-right { display: flex; align-items: center; gap: 15px; }
          
          .btn { background: none; border: none; color: white; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; opacity: 0.85; transition: opacity 0.2s, color 0.2s; }
          .btn:hover { opacity: 1; color: var(--accent); }
          .btn svg { width: 22px; height: 22px; fill: currentColor; }
          
          .time-display { font-size: 13px; font-variant-numeric: tabular-nums; opacity: 0.9; margin-left: 5px; }
          
          .speed-select { background: transparent; color: white; border: none; font-size: 13px; cursor: pointer; outline: none; opacity: 0.85; font-weight: 500; }
          .speed-select option { background: #222; color: white; }
          .speed-select:hover { opacity: 1; color: var(--accent); }
          
          .volume-group { display: flex; align-items: center; gap: 5px; }
          .volume-slider { width: 0; opacity: 0; transition: width 0.2s, opacity 0.2s; overflow: hidden; display: flex; align-items: center; }
          .volume-group:hover .volume-slider { width: 60px; opacity: 1; }
          .volume-slider input { width: 100%; margin: 0; cursor: pointer; accent-color: white; }

          /* Central Play Icon Overlay */
          .center-play { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(1.5); width: 60px; height: 60px; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0; transition: opacity 0.2s, transform 0.2s; color: white; }
          .center-play.animating { opacity: 1; transform: translate(-50%, -50%) scale(2); transition: opacity 0s, transform 0s; }
          .center-play svg { width: 32px; height: 32px; fill: currentColor; margin-left: 4px; }
        </style>
      </head>
      <body>
        <div class="video-container" id="videoContainer">
          <video id="vid" src="${videoUri}"></video>
          <video id="webcam" src="${webcamUri}" muted autoplay playsinline></video>
          <audio id="audio" src="${audioUri}"></audio>
          
          <div class="center-play" id="centerPlay">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>

          <div class="controls-overlay" id="controlsOverlay">
            <div class="timeline-wrapper" id="timeline" onclick="seek(event)">
              <div class="timeline-track" id="timelineTrack">
                <div class="timeline-progress" id="progress"></div>
                <div class="timeline-thumb" id="thumb"></div>
                <!-- Markers get injected here -->
              </div>
            </div>

            <div class="controls-row">
              <div class="controls-left">
                <button class="btn" id="playBtn" onclick="togglePlay()" title="Play/Pause (Space)">
                  <svg id="playIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  <svg id="pauseIcon" viewBox="0 0 24 24" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </button>
                
                <div class="volume-group">
                  <button class="btn" onclick="toggleMute()" title="Mute/Unmute">
                    <svg id="volOnIcon" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                    <svg id="volOffIcon" viewBox="0 0 24 24" style="display:none;"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                  </button>
                  <div class="volume-slider">
                    <input type="range" id="volSlider" min="0" max="1" step="0.05" value="1" oninput="changeVolume(this.value)">
                  </div>
                </div>

                <span class="time-display" id="timeDisplay">0:00 / 0:00</span>
              </div>

              <div class="controls-right">
                <button class="btn" onclick="fork()" title="Create Fork Here" style="font-size: 13px; font-weight: 500; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; padding: 2px 8px;">
                  <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; margin-right: 4px;"><path d="M15 4c-1.1 0-2 .9-2 2 0 .53.22 1.01.57 1.34l-3.08 3.08c-.33-.35-.81-.57-1.34-.57s-1.01.22-1.34.57L4.73 7.34C5.08 7.01 5.3 6.53 5.3 6c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2c.53 0 1.01-.22 1.34-.57l3.08 3.08c-.35.33-.57.81-.57 1.34s.22 1.01.57 1.34l-3.08 3.08C4.33 16.22 3.85 16 3.33 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2c0-.53-.22-1.01-.57-1.34l3.08-3.08c.33.35.81.57 1.34.57s1.01-.22 1.34-.57l3.08 3.08c-.35.33-.57.81-.57 1.34 0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2c-.53 0-1.01.22-1.34.57l-3.08-3.08c.35-.33.57-.81.57-1.34s-.22-1.01-.57-1.34l3.08-3.08c.33.35.81.57 1.34.57 1.1 0 2-.9 2-2s-.9-2-2-2z"/></svg>
                  Fork
                </button>
                
                <select class="speed-select" id="speedSelect" onchange="changeSpeed(this.value)" title="Playback Speed">
                  <option value="0.75">0.75x</option>
                  <option value="1" selected>1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>

                <button class="btn" onclick="toggleFullscreen()" title="Fullscreen (f)">
                  <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const vid = document.getElementById('vid');
          const webcam = document.getElementById('webcam');
          const audio = document.getElementById('audio');
          
          webcam.addEventListener('error', () => webcam.style.display = 'none');
          
          const durationMs = ${duration};
          const startTimeMs = ${startTimeMs};
          const chapters = ${serializeForInlineScript(chapters)};
          const challenges = ${serializeForInlineScript(challenges)};
          const forks = ${serializeForInlineScript(forks)};
          
          const track = document.getElementById('timelineTrack');
          const prog = document.getElementById('progress');
          const thumb = document.getElementById('thumb');
          const timeDisp = document.getElementById('timeDisplay');
          const playIcon = document.getElementById('playIcon');
          const pauseIcon = document.getElementById('pauseIcon');
          const centerPlay = document.getElementById('centerPlay');
          let isDragging = false;

          function updateSync() {
            if (Math.abs(webcam.currentTime - vid.currentTime) > 0.5) webcam.currentTime = vid.currentTime;
            if (Math.abs(audio.currentTime - vid.currentTime) > 0.5) audio.currentTime = vid.currentTime;
          }

          // Format mm:ss
          function fmt(ms) {
            const sec = Math.floor(Math.max(0, ms) / 1000);
            return Math.floor(sec/60) + ':' + (sec%60).toString().padStart(2,'0');
          }

          // Initialize markers
          function addMarker(arr, cls, getLabel, getTime) {
            arr.forEach(item => {
              const t = getTime(item);
              if (t < 0 || t > durationMs) return;
              const p = (t / durationMs) * 100;
              const el = document.createElement('div');
              el.className = 'marker ' + cls;
              el.style.left = p + '%';
              
              const tt = document.createElement('div');
              tt.className = 'tooltip';
              tt.innerHTML = getLabel(item);
              el.appendChild(tt);
              
              el.onclick = (e) => { e.stopPropagation(); seekToTime(t); };
              track.appendChild(el);
            });
          }
          addMarker(chapters, 'chapter', c => 'Chapter: ' + c.title, c => c.t);
          addMarker(challenges, 'challenge', c => 'Challenge: ' + c.prompt, c => c.t);
          addMarker(forks, 'fork', f => {
            return '<span>Fork: ' + f.label + '</span><button onclick="event.stopPropagation(); vscode.postMessage({command: \\'openFork\\', forkId: \\'' + f.id + '\\'})" style="padding: 4px 8px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">Open in code editor</button>';
          }, f => f.t - startTimeMs);

          function updateTimeUI() {
            const relTimeMs = vid.currentTime * 1000;
            if (!isDragging) {
              const p = (relTimeMs / durationMs) * 100;
              prog.style.width = p + '%';
              thumb.style.left = p + '%';
            }
            timeDisp.innerText = fmt(relTimeMs) + ' / ' + fmt(durationMs);
          }

          vid.addEventListener('timeupdate', () => {
            updateTimeUI();
            const absTimeMs = startTimeMs + vid.currentTime * 1000;
            vscode.postMessage({ command: 'timeupdate', timeMs: absTimeMs });
            updateSync();
          });

          vid.addEventListener('play', () => {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
            webcam.play().catch(()=>{});
            audio.play().catch(()=>{});
            vscode.postMessage({ command: 'play' });
          });
          
          vid.addEventListener('pause', () => {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            webcam.pause();
            audio.pause();
            vscode.postMessage({ command: 'pause' });
          });

          vid.addEventListener('ended', () => {
            vscode.postMessage({ command: 'ended' });
          });

          function togglePlay() {
            if (vid.paused) vid.play();
            else vid.pause();
          }

          function seekToTime(ms) {
            vid.currentTime = ms / 1000;
            updateSync();
          }

          function seek(e) {
            const rect = track.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seekToTime(percent * durationMs);
          }

          function fork() {
            vid.pause();
            vscode.postMessage({ command: 'fork', timeMs: startTimeMs + vid.currentTime * 1000 });
          }

          function changeSpeed(val) { vid.playbackRate = parseFloat(val); }
          
          function toggleMute() {
            vid.muted = !vid.muted;
            document.getElementById('volOnIcon').style.display = vid.muted || vid.volume===0 ? 'none' : 'block';
            document.getElementById('volOffIcon').style.display = vid.muted || vid.volume===0 ? 'block' : 'none';
            if (!vid.muted && vid.volume === 0) { vid.volume = 0.5; document.getElementById('volSlider').value = 0.5; }
          }
          function changeVolume(val) {
            vid.volume = val;
            vid.muted = (val == 0);
            document.getElementById('volOnIcon').style.display = vid.muted ? 'none' : 'block';
            document.getElementById('volOffIcon').style.display = vid.muted ? 'block' : 'none';
          }

          function toggleFullscreen() {
            const container = document.getElementById('videoContainer');
            if (!document.fullscreenElement) container.requestFullscreen();
            else document.exitFullscreen();
          }

          // Center play animation
          document.getElementById('videoContainer').addEventListener('click', (e) => {
            if (e.target.closest('.controls-overlay')) return;
            togglePlay();
            centerPlay.innerHTML = vid.paused ? '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            centerPlay.classList.add('animating');
            setTimeout(() => centerPlay.classList.remove('animating'), 50);
          });

          // Keyboard shortcuts
          window.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
            else if (e.code === 'ArrowLeft') seekToTime(vid.currentTime*1000 - 5000);
            else if (e.code === 'ArrowRight') seekToTime(vid.currentTime*1000 + 5000);
            else if (e.code === 'KeyF') toggleFullscreen();
          });

          // Scrubbing logic
          const timelineWrap = document.getElementById('timeline');
          timelineWrap.addEventListener('mousedown', (e) => {
            isDragging = true;
            seek(e);
          });
          window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = track.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            prog.style.width = (percent * 100) + '%';
            thumb.style.left = (percent * 100) + '%';
            seekToTime(percent * durationMs);
          });
          window.addEventListener('mouseup', () => { isDragging = false; });

          window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'play') vid.play();
            if (msg.command === 'pause') vid.pause();
            if (msg.command === 'seek') vid.currentTime = (msg.timeMs - startTimeMs) / 1000;
          });
          
          // Initial trigger
          updateTimeUI();
          vid.play();
        </script>
      </body>
      </html>
    `;
  }
}
