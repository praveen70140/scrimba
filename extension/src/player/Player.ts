import * as vscode from 'vscode';
import { ScrimSession } from '../core/ScrimSession';
import { StateManager } from '../core/StateManager';
import { EventReplayer } from './EventReplayer';
import { EditorApplicator } from './EditorApplicator';
import { TerminalReplayer } from './TerminalReplayer';
import { ForkManager } from './ForkManager';
import { ScrimFS } from '../core/ScrimFS';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { ScrimReader } from '../utils/ScrimReader';
import * as path from 'path';

/**
 * The main Player Engine. Orchestrates playback, scrubbing, state transitions,
 * and UI components (webview, terminal, editor).
 */
export class Player implements vscode.Disposable {
  private eventReplayer: EventReplayer;
  private editorApplicator: EditorApplicator;
  private terminalReplayer = new TerminalReplayer();
  private forkManager: ForkManager;
  
  private playbackTimer: NodeJS.Timeout | undefined;
  private lastTickMs: number = 0;

  constructor(
    private session: ScrimSession,
    private stateManager: StateManager,
    private scrimFs: ScrimFS
  ) {
    this.editorApplicator = new EditorApplicator(this.scrimFs);
    this.eventReplayer = new EventReplayer(this.editorApplicator, (data) => {
      this.terminalReplayer.write(data);
    });
    this.forkManager = new ForkManager(this.session, this.scrimFs);

    // Listen to state transitions to trigger side-effects
    this.stateManager.onDidTransition(e => this.handleStateTransition(e.from, e.to));
  }

  /**
   * Loads a lesson into the player:
   * 1. Reads lesson.scrim from the given path
   * 2. Populates ScrimFS with starter files
   * 3. Sets state to IDLE
   */
  public async loadLesson(scrimFilePath: string): Promise<void> {
    const data = await ScrimReader.read(scrimFilePath);
    
    this.session.events = data.events;
    this.session.currentTimeMs = 0;
    this.eventReplayer.loadEvents(data.events);

    // Load starter files into Virtual FS
    this.scrimFs.mount(data.workspace.files);

    this.terminalReplayer.clear();
    this.terminalReplayer.show();

    if (this.stateManager.canTransition('IDLE')) {
      this.stateManager.transition('IDLE');
    }
  }

  public play(): void {
    if (this.stateManager.canTransition('PLAYING')) {
      this.stateManager.transition('PLAYING');
    }
  }

  public pause(): void {
    if (this.stateManager.canTransition('PAUSED')) {
      this.stateManager.transition('PAUSED');
    }
  }

  public async fork(): Promise<void> {
    if (this.stateManager.canTransition('FORKED')) {
      const forkUri = await this.forkManager.createFork();
      await WorkspaceManager.openEditable(forkUri);
      this.stateManager.transition('FORKED');
    }
  }

  public async resumeFromFork(): Promise<void> {
    if (this.stateManager.canTransition('PLAYING')) {
      // Re-open teacher readonly workspace (handled by caller passing teacherDir)
      if (this.session.teacherDir) {
        await WorkspaceManager.openEditable(vscode.Uri.file(this.session.teacherDir));
      }
      this.forkManager.clearActiveFork();
      this.stateManager.transition('PLAYING');
    }
  }

  public async seekTo(timeMs: number): Promise<void> {
    const wasPlaying = this.session.playerState === 'PLAYING';
    if (wasPlaying) this.pause();
    
    this.session.currentTimeMs = timeMs;
    // Replay events from 0 to timeMs fast
    this.terminalReplayer.clear();
    await this.eventReplayer.syncToTimestamp(timeMs, true);
    
    if (wasPlaying) this.play();
  }

  private handleStateTransition(from: string, to: string): void {
    if (to === 'PLAYING') {
      this.startTimer();
    } else {
      this.stopTimer();
    }

    // When playing or paused, we should be viewing the teacher readonly files
    if ((to === 'PLAYING' || to === 'PAUSED') && from === 'FORKED') {
      // The resume action opens the workspace, UI will update.
    }
  }

  private startTimer(): void {
    if (this.playbackTimer) return;
    this.lastTickMs = Date.now();
    let ticking = false;
    this.playbackTimer = setInterval(async () => {
      if (ticking) return;
      ticking = true;
      try {
        const now = Date.now();
        const delta = now - this.lastTickMs;
        this.lastTickMs = now;

        this.session.currentTimeMs += delta;

        // Sync events up to currentTimeMs
        const prevIndex = this.eventReplayer.getCurrentIndex();
        await this.eventReplayer.syncToTimestamp(this.session.currentTimeMs, false);
        const newIndex = this.eventReplayer.getCurrentIndex();

        // Check for challenge event we just passed
        for (let i = prevIndex; i < newIndex; i++) {
          const event = this.session.events[i];
          if (event.type === 'challenge') {
            this.session.currentTimeMs = event.t; // Snap precisely
            this.pause(); // Wait for user to fork or skip
            if (this.stateManager.canTransition('CHALLENGE')) {
              this.stateManager.transition('CHALLENGE');
            }
            break;
          }
        }

        const durationMs = this.session.lessonMeta?.durationMs;
        if (durationMs && this.session.currentTimeMs >= durationMs) {
          this.session.currentTimeMs = durationMs;
          this.pause();
        }
      } finally {
        ticking = false;
      }
    }, 30); // ~30fps update rate
  }

  private stopTimer(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = undefined;
    }
  }

  public dispose(): void {
    this.stopTimer();
    this.terminalReplayer.dispose();
  }
}
