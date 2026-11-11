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
  private handledChallenges = new Set<string>();
  private lessonGeneration = 0;
  private transitionSubscription: vscode.Disposable;

  constructor(
    private context: vscode.ExtensionContext,
    private session: ScrimSession,
    private stateManager: StateManager
  ) {
    this.forkManager = new ForkManager(this.session, this.context);
    this.transitionSubscription = this.stateManager.onDidTransition(e => this.handleStateTransition(e.from, e.to));
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
    
    this.lessonGeneration++;
    this.handledChallenges.clear();
    this.session.activeFork = null;
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

    this.stateManager.reset();
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

  public updateTime(timeMs: number): void {
    const oldTime = this.session.currentTimeMs;
    this.session.currentTimeMs = timeMs;

    if (this.session.playerState !== 'PLAYING') return;
    const startTimeMs = this.session.lessonMeta.screenStartMs || 0;
    const oldRelativeMs = Math.max(0, oldTime - startTimeMs);
    const relativeMs = Math.max(0, timeMs - startTimeMs);
    for (const event of this.session.events) {
      if (event.type !== 'challenge' || this.handledChallenges.has(event.id)) continue;
      const eventTimeMs = this.normalizeEventTime(event.t);
      if (oldRelativeMs <= eventTimeMs && relativeMs >= eventTimeMs && relativeMs > oldRelativeMs && this.stateManager.canTransition('CHALLENGE')) {
        this.handledChallenges.add(event.id);
        this.stateManager.transition('CHALLENGE');
        void this.handleChallenge(event).catch(error => {
          console.error('[Player] Challenge failed to open:', error);
          vscode.window.showErrorMessage(`Could not open challenge workspace: ${error?.message ?? error}`);
          if (this.stateManager.canTransition('PLAYING')) this.play();
        });
        break;
      }
    }
  }

  private normalizeEventTime(timeMs: number): number {
    const absoluteThreshold = 1_000_000_000_000;
    if (timeMs >= absoluteThreshold) {
      const absoluteEvents = this.session.events.map(e => e.t).filter(t => t >= absoluteThreshold);
      const base = absoluteEvents.length ? Math.min(...absoluteEvents) : timeMs;
      return Math.max(0, timeMs - base);
    }
    return Math.max(0, timeMs);
  }

  private async handleChallenge(event: any) {
    const generation = this.lessonGeneration;
    const challenge = {
      id: event.id,
      prompt: event.prompt,
      hint: event.hint,
      testCmd: event.test_cmd,
      allowSkip: event.allow_skip ?? false,
    };
    // A challenge is a checkpoint: create its editable workspace automatically.
    await this.forkManager.createFork(challenge);
    if (generation !== this.lessonGeneration) return;
    this.notifyWorkspaceSnapshot();
    const promptMsg = `🎯 Challenge: ${event.prompt}`;
    const options = [];
    if (event.hint) options.push('Show Hint');
    if (event.test_cmd) options.push('Check Answer');
    else options.push('Mark Challenge Complete');
    if (event.allow_skip) options.push('Skip Challenge');
    
    while (generation === this.lessonGeneration && this.session.playerState === 'CHALLENGE') {
      const choice = await vscode.window.showInformationMessage(promptMsg, { modal: true }, ...options);
      
      if (choice === 'Show Hint') {
        vscode.window.showInformationMessage(`💡 Hint: ${event.hint}`);
      } else if (choice === 'Check Answer') {
        if (!this.session.activeFork) {
          vscode.window.showErrorMessage('The challenge workspace could not be created.');
          break;
        }
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Running tests...' }, async () => {
          const { ChallengeRunner } = require('../challenge/ChallengeRunner');
          const runner = new ChallengeRunner();
          
          let timeoutMs = 30000;
          if (event.time_limit_s) timeoutMs = event.time_limit_s * 1000;
          
          const result = await runner.runChallenge(event.test_cmd, this.session.activeFork!.forkPath, timeoutMs);
          if (result.passed) {
            vscode.window.showInformationMessage(`✅ Challenge Passed!\n\n${result.output}`);
            if (this.stateManager.canTransition('PLAYING')) {
              this.stateManager.transition('PLAYING');
              this.play();
            }
          } else {
            vscode.window.showErrorMessage(`❌ Challenge Failed\n\n${result.output}`);
          }
        });
        if (this.session.playerState !== 'CHALLENGE') break; // passed
      } else if (choice === 'Mark Challenge Complete' || choice === 'Skip Challenge' || (choice === undefined && event.allow_skip)) {
        if (this.stateManager.canTransition('PLAYING')) {
          this.stateManager.transition('PLAYING');
          this.play();
        }
        break;
      }
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
      this.notifyWorkspaceSnapshot();
    }
  }

  private notifyWorkspaceSnapshot(): void {
    const snapshot = this.session.activeFork;
    if (!snapshot) return;
    this.playerPanel?.addWorkspaceSnapshot({
      id: snapshot.forkId,
      t: snapshot.timestampMs,
      label: snapshot.label,
    });
  }

  private handleStateTransition(from: string, to: string): void {
    if (to === 'PLAYING') {
      if (this.playerPanel) this.playerPanel.playVideo();
    } else if (to === 'IDLE' || to === 'PAUSED' || to === 'FORKED' || to === 'CHALLENGE') {
      if (this.playerPanel) this.playerPanel.pauseVideo();
    }
  }

  public dispose() {
    this.transitionSubscription.dispose();
    this.playerPanel?.dispose();
  }
}
