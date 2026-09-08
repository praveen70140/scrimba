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

  public updateTime(timeMs: number): void {
    const oldTime = this.session.currentTimeMs;
    this.session.currentTimeMs = timeMs;

    // Check if we crossed a challenge event
    if (this.session.playerState === 'PLAYING' && this.session.events) {
      for (const event of this.session.events) {
        if (event.type === 'challenge') {
          if (oldTime < event.t && timeMs >= event.t) {
            if (this.stateManager.canTransition('CHALLENGE')) {
              this.stateManager.transition('CHALLENGE');
              this.pause();
              this.handleChallenge(event as any);
              break;
            }
          }
        }
      }
    }
  }

  private async handleChallenge(event: any) {
    const promptMsg = `🎯 Challenge: ${event.prompt}`;
    const options = [];
    if (event.hint) options.push('Show Hint');
    if (event.test_cmd) options.push('Check Answer');
    options.push('Skip Challenge');
    
    while (this.session.playerState === 'CHALLENGE') {
      const choice = await vscode.window.showInformationMessage(promptMsg, { modal: true }, ...options);
      
      if (choice === 'Show Hint') {
        vscode.window.showInformationMessage(`💡 Hint: ${event.hint}`);
      } else if (choice === 'Check Answer') {
        if (!this.session.activeFork) {
          vscode.window.showErrorMessage('You must fork the code first to solve the challenge!');
          continue;
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
      } else if (choice === 'Skip Challenge' || choice === undefined) {
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
