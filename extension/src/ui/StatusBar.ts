import * as vscode from 'vscode';
import { ScrimSession } from '../core/ScrimSession';
import { Player } from '../player/Player';
import { StateManager } from '../core/StateManager';

export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private ticker: NodeJS.Timeout;

  constructor(
    private session: ScrimSession,
    private player: Player,
    private stateManager: StateManager
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    
    this.disposables.push(this.stateManager.onDidTransition(() => this.update()));
    
    this.ticker = setInterval(() => this.update(), 1000);
    this.update();
  }

  public show(): void {
    this.item.show();
  }

  public hide(): void {
    this.item.hide();
  }

  private update(): void {
    const state = this.session.playerState;
    const time = ScrimSession.formatTime(this.session.currentTimeMs);

    // Reset default command and color
    this.item.command = 'scrim.togglePlayPause';
    this.item.color = undefined;

    if (state === 'IDLE') {
      this.item.text = `$(play) Scrimba: Ready`;
      this.item.tooltip = 'Click to Play';
    } else if (state === 'PLAYING') {
      this.item.text = `$(debug-pause) Scrimba: ${time}`;
      this.item.tooltip = 'Click to Pause';
    } else if (state === 'PAUSED') {
      this.item.text = `$(play) Scrimba: ${time}`;
      this.item.tooltip = 'Click to Play';
    } else if (state === 'FORKED') {
      this.item.text = `$(git-branch) Scrimba: Editing Fork`;
      this.item.tooltip = 'You are editing a fork. Click to resume playback.';
      this.item.command = 'scrim.resume';
    } else if (state === 'CHALLENGE') {
      this.item.text = `$(tasklist) Scrimba: Challenge`;
      this.item.tooltip = 'Complete the challenge or skip to continue.';
      this.item.command = undefined; // No toggle play/pause here
    }

    if (this.session.isRecording) {
      this.item.text = `$(record) REC ${ScrimSession.formatTime(this.session.recordingElapsedMs)}`;
      this.item.tooltip = 'Click to Stop Recording';
      this.item.command = 'scrim.stopRecording';
      this.item.color = new vscode.ThemeColor('errorForeground');
    }
  }

  public dispose(): void {
    clearInterval(this.ticker);
    for (const d of this.disposables) { d.dispose(); }
    this.item.dispose();
  }
}
