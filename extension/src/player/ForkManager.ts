import * as vscode from 'vscode';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { ScrimSession } from '../core/ScrimSession';
import { ScrimFS } from '../core/ScrimFS';
import * as path from 'path';

/**
 * Manages the lifecycle of a student's fork during playback.
 */
export class ForkManager {
  constructor(private session: ScrimSession, private scrimFs: ScrimFS) {}

  /**
   * Captures the current virtual files and writes them to a physical fork directory.
   */
  public async createFork(): Promise<vscode.Uri> {
    const lessonId = this.session.lessonMeta.id;
    const t = this.session.currentTimeMs;
    
    // Generate fork ID: "fork_1m24s_a3f2"
    const labelTime = ScrimSession.formatTime(t);
    const forkId = `fork_${labelTime.replace(':', 'm')}s_${Math.random().toString(36).slice(2, 6)}`;
    
    const virtualFiles = this.scrimFs.getAllFiles();

    const forkUri = await WorkspaceManager.createFork(lessonId, forkId, virtualFiles, t);
    
    this.session.activeFork = {
      forkId,
      label: `Fork at ${labelTime}`,
      timestampMs: t,
      forkPath: forkUri.fsPath
    };

    return forkUri;
  }

  /**
   * Opens the current active fork in the workspace.
   */
  public async openActiveFork(): Promise<void> {
    if (!this.session.activeFork) return;
    await WorkspaceManager.openEditable(vscode.Uri.file(this.session.activeFork.forkPath));
  }

  /**
   * Clears the active fork state. (User goes back to playback).
   */
  public clearActiveFork(): void {
    this.session.activeFork = null;
  }
}
