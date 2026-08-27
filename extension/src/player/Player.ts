import * as vscode from 'vscode';
import { ScrimSession } from '../core/ScrimSession';
import { StateManager } from '../core/StateManager';
import { ForkManager } from './ForkManager';
import { ScrimReader } from '../utils/ScrimReader';
import { PlayerPanel } from '../ui/PlayerPanel';

/**
 * The main Player Engine for Video-Only playback.
 * Orchestrates HTML5 video syncing and on-demand forking.
 */
export class Player implements vscode.Disposable {
  private forkManager: ForkManager;
  private playerPanel?: PlayerPanel;

  constructor(
    private context: vscode.ExtensionContext,
    private session: ScrimSession,
    private stateManager: StateManager
  ) {
    this.forkManager = new ForkManager(this.session, this.context);
    this.stateManager.onDidTransition(e => this.handleStateTransition(e.from, e.to));
  }

  public setPlayerPanel(panel: PlayerPanel) {
    this.playerPanel = panel;
  }

  /**
   * Loads a lesson into the player:
   * 1. Reads lesson.scrim from the given path
   * 2. Sets state to IDLE
   */
  public async loadLesson(scrimFilePath: string): Promise<void> {
    const data = await ScrimReader.read(scrimFilePath);
    
    this.session.events = data.events;
    this.session.initialFiles = data.workspace.files;
    this.session.lessonMeta = {
      id: data.meta.id,
      courseId: data.meta.courseId || '',
      title: data.meta.title,
      durationMs: data.meta.duration_ms || 0,
      screenStartMs: data.media?.screen?.start_time_ms
    };
    this.session.currentTimeMs = this.session.lessonMeta.screenStartMs || 0;

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

  public seekTo(timeMs: number): void {
    this.session.currentTimeMs = timeMs;
    // Tell the Webviews to seek their HTML5 <video> elements
    if (this.playerPanel) {
      this.playerPanel.seekVideo(timeMs);
    }
  }

  public async fork(): Promise<void> {
    if (this.session.playerState === 'PLAYING') {
      this.pause();
    }
    
    if (this.stateManager.canTransition('FORKED')) {
      this.stateManager.transition('FORKED');
      await this.forkManager.createFork();
    }
  }

  private handleStateTransition(from: string, to: string): void {
    if (to === 'PLAYING') {
      if (this.playerPanel) this.playerPanel.playVideo();
    } else if (to === 'PAUSED' || to === 'FORKED') {
      if (this.playerPanel) this.playerPanel.pauseVideo();
    }
  }

  public dispose() {
    this.playerPanel?.dispose();
  }
}
