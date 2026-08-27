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
    const starterDir = path.join(this.lessonDir, 'starter');
    const readDirRecursive = async (dir: string, baseDir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await readDirRecursive(fullPath, baseDir);
          } else {
            const relPath = path.relative(baseDir, fullPath);
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              this.initialFiles[relPath] = content;
            } catch (e) {
              console.warn(`[Recorder] Failed to read ${fullPath}:`, e);
            }
          }
        }
      } catch (e) {
        console.warn(`[Recorder] Failed to read dir ${dir}:`, e);
      }
    };
    
    await readDirRecursive(starterDir, starterDir);

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
    const courseId = path.basename(path.dirname(this.lessonDir));

    await ScrimWriter.write(path.join(this.lessonDir, 'lesson.scrim'), {
      version: 2,
      meta: {
        id: lessonId,
        courseId: courseId,
        title: lessonTitle,
        duration_ms: duration,
        language_hint: (this.session as any).lessonMeta?.languageHint || 'javascript',
        runtime_hint: (this.session as any).lessonMeta?.runtimeHint || 'node >= 20',
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

    if ((this as any).screenStarted) {
      const webmPath = path.join(this.lessonDir, 'screen.webm');
      const mp4Path = path.join(this.lessonDir, 'screen.mp4');
      const { FfmpegConverter } = require('../utils/FfmpegConverter');
      FfmpegConverter.startBackgroundTranscode(webmPath, mp4Path).catch((e: any) => {
        console.error('Failed to transcode screen.webm in background:', e);
      });
    }

    return allEvents;
  }

  public dispose(): void {
    this.statusBar.dispose();
    if (this.ticker) { clearInterval(this.ticker); }
  }
}
