import * as vscode from 'vscode';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { ScrimSession } from '../core/ScrimSession';
import { StateHydrator } from './StateHydrator';

export interface SnapshotChallenge {
  id: string;
  prompt: string;
  hint?: string;
  testCmd?: string;
  allowSkip?: boolean;
}

/** Creates local, editable workspace snapshots from lesson checkpoints. */
export class ForkManager {
  constructor(private session: ScrimSession, private context: vscode.ExtensionContext) {}

  public async createFork(challenge?: SnapshotChallenge): Promise<vscode.Uri> {
    const lessonId = this.session.lessonMeta.id;
    const timestampMs = this.session.currentTimeMs;
    const relTimeMs = Math.max(0, timestampMs - (this.session.lessonMeta.screenStartMs || 0));
    const labelTime = ScrimSession.formatTime(relTimeMs);
    const suffix = Math.random().toString(36).slice(2, 6);
    const forkId = `snapshot_${labelTime.replace(':', 'm')}s_${suffix}`;
    const virtualFiles = StateHydrator.hydrate(this.session.initialFiles, this.session.events, relTimeMs);
    const forkUri = await WorkspaceManager.createFork(lessonId, forkId, virtualFiles, timestampMs, { challenge });

    this.session.activeFork = {
      forkId,
      label: challenge ? `Challenge workspace at ${labelTime}` : `Workspace snapshot at ${labelTime}`,
      timestampMs,
      forkPath: forkUri.fsPath,
      kind: 'workspace-snapshot',
      challengeId: challenge?.id,
    };
    await this.openActiveFork();
    return forkUri;
  }

  public async openActiveFork(): Promise<void> {
    if (this.session.activeFork) {
      await WorkspaceManager.openFork(vscode.Uri.file(this.session.activeFork.forkPath), this.context);
    }
  }

  public clearActiveFork(): void { this.session.activeFork = null; }
}
