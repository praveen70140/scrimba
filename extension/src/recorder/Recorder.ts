import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ScrimEvent } from '@scrimba-clone/shared';
import { ScrimSession } from '../core/ScrimSession';
import { AudioCapture } from './AudioCapture';
import { WebcamCapture } from './WebcamCapture';
import { BrowserCapture, ScreenRegion } from './BrowserCapture';
import { EventCapture } from './EventCapture';
import { ScrimWriter } from './ScrimWriter';
import { FfmpegWrapper } from '../utils/FfmpegWrapper';

/**
 * Recorder orchestrates a complete recording session:
 *   start() → captures audio, webcam, browser screen, and VS Code events
 *   addChapter() / addChallenge() → inserts markers into the event log
 *   stop() → finalizes all streams and writes lesson.scrim + media files
 */
export class Recorder {
  private audioCapture = new AudioCapture();
  private webcamCapture = new WebcamCapture();
  private browserCapture = new BrowserCapture();
  private eventCapture: EventCapture;
  private session: ScrimSession;
  private lessonDir: string;
  private statusBar: vscode.StatusBarItem;
  private ticker: NodeJS.Timeout | undefined;

  constructor(session: ScrimSession, lessonDir: string) {
    this.session = session;
    this.lessonDir = lessonDir;
    this.eventCapture = new EventCapture(session, lessonDir);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  }

  public async start(context: vscode.ExtensionContext, browserRegion?: ScreenRegion): Promise<void> {
    // Snapshot starter files
    const starterDir = path.join(this.lessonDir, 'starter');
    await fs.mkdir(starterDir, { recursive: true });
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (wsFolder) {
      const pattern = new vscode.RelativePattern(wsFolder, '**/*');
      const allFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
      for (const f of allFiles) {
        const rel = path.relative(wsFolder.uri.fsPath, f.fsPath);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) { continue; }
        const dest = path.join(starterDir, rel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(f.fsPath, dest);
      }
    }

    // Start all media captures
    const audioDevice = (await FfmpegWrapper.detectAudioDevices())[0];
    const videoDevice = (await FfmpegWrapper.detectVideoDevices())[0];

    await this.audioCapture.start(this.lessonDir, audioDevice.path).catch(e =>
      console.warn('[Recorder] Audio capture failed (no mic?):', e.message)
    );
    await this.webcamCapture.start(this.lessonDir, videoDevice.path).catch(e =>
      console.warn('[Recorder] Webcam capture failed (no camera?):', e.message)
    );
    if (browserRegion) {
      await this.browserCapture.start(this.lessonDir, browserRegion).catch(e =>
        console.warn('[Recorder] Browser capture failed:', e.message)
      );
    }

    // Start VS Code event capture
    this.session.isRecording = true;
    this.session.recordingStartMs = Date.now();
    this.session.recordedEvents = [];
    this.eventCapture.start(context);

    // Status bar ticker
    this.statusBar.show();
    this.ticker = setInterval(() => {
      const elapsed = ScrimSession.formatTime(this.session.recordingElapsedMs);
      this.statusBar.text = `🔴 REC ${elapsed}`;
      this.statusBar.tooltip = 'Click to stop recording';
      this.statusBar.command = 'scrim.stopRecording';
    }, 1000);
  }

  public addChapter(title: string): void {
    const t = this.session.recordingElapsedMs;
    this.session.recordedEvents.push({ t, type: 'chapter', title, description: '' });
  }

  public addChallenge(id: string, prompt: string, testCmd: string, hint: string = ''): void {
    const t = this.session.recordingElapsedMs;
    this.session.recordedEvents.push({ t, type: 'challenge', id, prompt, hint, test_cmd: testCmd, time_limit_s: null });
  }

  public async stop(): Promise<ScrimEvent[]> {
    // Stop ticker
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
    this.statusBar.text = '🟡 Processing...';

    // Stop all captures
    const [, , events] = await Promise.all([
      this.audioCapture.stop().catch(e => console.warn('[Recorder] Audio stop error:', e.message)),
      this.webcamCapture.stop().catch(e => console.warn('[Recorder] Webcam stop error:', e.message)),
      this.browserCapture.stop().catch(e => console.warn('[Recorder] Browser stop error:', e.message)),
      this.eventCapture.stop(),
    ]);

    this.session.isRecording = false;
    const allEvents = this.session.recordedEvents;

    // Write the .scrim file
    const duration = this.session.recordingElapsedMs;
    const starterFiles: Record<string, string> = {};
    const starterDir = path.join(this.lessonDir, 'starter');
    try {
      const entries = await fs.readdir(starterDir, { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          // entry.parentPath is available in Node 18.19+, but path.join(entry.path) works too
          // Node 20 types support entry.parentPath || entry.path.
          const parentDir = (entry as any).parentPath || entry.path;
          const fullPath = path.join(parentDir, entry.name);
          const relPath = path.relative(starterDir, fullPath);
          try {
            starterFiles[relPath] = await fs.readFile(fullPath, 'utf-8');
          } catch (e) {
            console.warn(`[Recorder] Failed to read starter file ${relPath}:`, e);
          }
        }
      }
    } catch { /* starter dir might be empty */ }

    await ScrimWriter.write(path.join(this.lessonDir, 'lesson.scrim'), {
      version: 2,
      meta: {
        id: this.session.lessonMeta.id,
        title: this.session.lessonMeta.title,
        duration_ms: duration,
        language_hint: 'javascript',
        runtime_hint: 'node >= 20',
      },
      workspace: { files: starterFiles },
      media: {
        audio: { file: 'audio.ogg', duration_ms: duration },
        webcam: { file: 'webcam.mp4', duration_ms: duration },
        browser_preview: { file: 'browser-preview.mp4', duration_ms: duration },
      },
      events: allEvents,
    });

    this.statusBar.text = '🟢 Done';
    setTimeout(() => this.statusBar.hide(), 3000);

    return allEvents;
  }

  public dispose(): void {
    this.statusBar.dispose();
    if (this.ticker) { clearInterval(this.ticker); }
  }
}
