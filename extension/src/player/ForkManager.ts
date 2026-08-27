import * as vscode from 'vscode';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { ScrimSession } from '../core/ScrimSession';
import { StateHydrator } from './StateHydrator';
import * as path from 'path';

/**
 * Manages the lifecycle of a student's fork during playback.
 */
export class ForkManager {
  constructor(private session: ScrimSession, private context: vscode.ExtensionContext) {}

  /**
   * Calculates the file state using StateHydrator and writes them to a physical fork directory.
   */
  public async createFork(): Promise<vscode.Uri> {
    const lessonId = this.session.lessonMeta.id;
    const t = this.session.currentTimeMs;
    
    // Generate fork ID: "fork_1m24s_a3f2"
    const relT = t - (this.session.lessonMeta.screenStartMs || 0);
    const labelTime = ScrimSession.formatTime(relT);
    const forkId = `fork_${labelTime.replace(':', 'm')}s_${Math.random().toString(36).slice(2, 6)}`;
    
    // Calculate the codebase state exactly at the requested time
    const virtualFiles = StateHydrator.hydrate(this.session.initialFiles, this.session.events, relT);

    // Write to a real physical directory and open it
    const forkUri = await WorkspaceManager.createFork(lessonId, forkId, virtualFiles, t);
    
    this.session.activeFork = {
      forkId,
      label: `Fork at ${labelTime}`,
      timestampMs: t,
      forkPath: forkUri.fsPath
    };

    // Open the folder automatically
    await this.openActiveFork();

    return forkUri;
  }

  /**
   * Opens the current active fork in the workspace.
   */
  public async openActiveFork(): Promise<void> {
    if (!this.session.activeFork) return;
    // Open the folder automatically in a new window so playback doesn't die
    await WorkspaceManager.openFork(vscode.Uri.file(this.session.activeFork.forkPath), this.context);
  }

  /**
   * Clears the active fork state. (User goes back to playback).
   */
  public clearActiveFork(): void {
    this.session.activeFork = null;
  }
}
