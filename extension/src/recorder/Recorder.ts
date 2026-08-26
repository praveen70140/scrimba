import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ScrimEvent } from '@scrimba-clone/shared';
import { ScrimSession } from '../core/ScrimSession';
import { AudioCapture } from './AudioCapture';
import { WebcamCapture } from './WebcamCapture';
import { ScreenCapture } from './ScreenCapture';
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
  private screenCapture = new ScreenCapture();
  private eventCapture: EventCapture;
  private session: ScrimSession;
  private lessonDir: string;
  private statusBar: vscode.StatusBarItem;
  private ticker: NodeJS.Timeout | undefined;

  constructor(session: ScrimSession, lessonDir: string) {
    this.session = session;
    this.lessonDir = lessonDir;
    this.eventCapture = new EventCapture(session, path.join(lessonDir, 'starter'));
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  }

  private initialFiles: Record<string, string> = {};

  public async start(context: vscode.ExtensionContext): Promise<void> {
    // Snapshot starter files in memory at the exact moment recording starts
    this.initialFiles = {};
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (wsFolder) {
      const pattern = new vscode.RelativePattern(wsFolder, '**/*');
      const allFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
      for (const f of allFiles) {
        const rel = path.relative(wsFolder.uri.fsPath, f.fsPath);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) { continue; }
        try {
          const content = await fs.readFile(f.fsPath, 'utf-8');
          this.initialFiles[rel] = content;
        } catch (e) {
          console.warn(`[Recorder] Failed to read ${f.fsPath} for snapshot:`, e);
        }
      }
    }

    // Start all media captures
    const audioDevice = (await FfmpegWrapper.detectAudioDevices())[0];
    const videoDevice = (await FfmpegWrapper.detectVideoDevices())[0];

    if (audioDevice) {
      try {
        await this.audioCapture.start(this.lessonDir, audioDevice.path);
        (this as any).audioStarted = true;
        (this as any).audioStartMs = Date.now();
      } catch (e: any) {
        console.warn('[Recorder] Audio capture failed (no mic?):', e?.message ?? e);
      }
    } else {
      console.warn('[Recorder] No audio input device found; skipping audio capture.');
    }

    if (videoDevice) {
      try {
        await this.webcamCapture.start(this.lessonDir, videoDevice.path);
        (this as any).webcamStarted = true;
        (this as any).webcamStartMs = Date.now();
      } catch (e: any) {
        console.warn('[Recorder] Webcam capture failed (no camera?):', e?.message ?? e);
      }
    } else {
      console.warn('[Recorder] No video input device found; skipping webcam capture.');
    }

    // screenCapture will block until browser starts, but we don't await it here so other things start
    this.screenCapture.start(this.lessonDir).then(screenStartMs => {
      (this as any).screenStarted = true;
      (this as any).screenStartMs = screenStartMs;
    }).catch(e => {
      console.warn('[Recorder] Screen capture failed:', e.message);
    });

    // Start VS Code event capture
    this.session.isRecording = true;
    this.session.recordingStartMs = Date.now(); // absolute time we consider the lesson started
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
    await Promise.all([
      this.audioCapture.stop().catch(e => console.warn('[Recorder] Audio stop error:', e.message)),
      this.webcamCapture.stop().catch(e => console.warn('[Recorder] Webcam stop error:', e.message)),
      this.screenCapture.stop().catch(e => console.warn('[Recorder] Screen stop error:', e.message)),
      this.eventCapture.stop(),
    ]);

    this.session.isRecording = false;
    const allEvents = this.session.recordedEvents;

    // Write the .scrim file
    const duration = this.session.recordingElapsedMs;
    const starterFiles = this.initialFiles;

    const lessonId = this.session.lessonMeta?.id || path.basename(this.lessonDir) || 'unknown';
    const lessonTitle = this.session.lessonMeta?.title || lessonId;

    await ScrimWriter.write(path.join(this.lessonDir, 'lesson.scrim'), {
      version: 2,
      meta: {
        id: lessonId,
        title: lessonTitle,
        duration_ms: duration,
        language_hint: 'javascript',
        runtime_hint: 'node >= 20',
      },
      workspace: { files: starterFiles },
      media: {
        ...((this as any).audioStarted ? { audio: { file: 'audio.ogg', duration_ms: duration, start_time_ms: (this as any).audioStartMs } } : {}),
        ...((this as any).webcamStarted ? { webcam: { file: 'webcam.mp4', duration_ms: duration, start_time_ms: (this as any).webcamStartMs } } : {}),
        ...((this as any).screenStarted ? { screen: { file: 'screen.webm', duration_ms: duration, start_time_ms: (this as any).screenStartMs } } : {}),
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
