import { ScrimEvent } from '@scrimba-clone/shared';

export type PlayerState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'FORKED' | 'CHALLENGE';

export interface LessonMeta {
  id: string;
  courseId: string;
  title: string;
  durationMs: number;
}

export interface ForkInfo {
  forkId: string;
  timestampMs: number;
  label: string;
  forkPath: string;
}

/**
 * ScrimSession holds ALL mutable state for a single active lesson session.
 * It is the single source of truth — nothing else stores lesson state.
 */
export class ScrimSession {
  // ── Lesson identity ──────────────────────────────────────────────────────
  public readonly lessonMeta: LessonMeta;

  // ── Playback state ───────────────────────────────────────────────────────
  public playerState: PlayerState = 'IDLE';
  public currentTimeMs: number = 0;

  // ── Recorded events (loaded from .scrim file) ────────────────────────────
  public events: ScrimEvent[] = [];

  // ── Workspace paths ──────────────────────────────────────────────────────
  public teacherDir: string = '';        // readonly teacher playback folder
  public activeFork: ForkInfo | null = null;  // currently open fork, if any

  // ── Recording state (used in teacher mode) ────────────────────────────────
  public isRecording: boolean = false;
  public recordingStartMs: number = 0;
  public recordedEvents: ScrimEvent[] = [];

  constructor(meta: LessonMeta) {
    this.lessonMeta = meta;
  }

  /** Returns elapsed time since recording started */
  public get recordingElapsedMs(): number {
    if (!this.isRecording) return 0;
    return Date.now() - this.recordingStartMs;
  }

  /** Returns a human-readable label like "1:24" for a given ms value */
  public static formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
