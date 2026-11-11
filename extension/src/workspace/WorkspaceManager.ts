import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Paths } from '../utils/Paths';

const run = promisify(execFile);

export interface WorkspaceSnapshotOptions {
  challenge?: {
    id: string;
    prompt: string;
    hint?: string;
    testCmd?: string;
    allowSkip?: boolean;
  };
}

export class WorkspaceManager {
  static async initCourse(courseId: string, courseManifest: any): Promise<void> {
    const courseDir = vscode.Uri.file(Paths.getCourseDir(courseId));
    await vscode.workspace.fs.createDirectory(courseDir);
    const manifestUri = vscode.Uri.joinPath(courseDir, 'course.json');
    await vscode.workspace.fs.writeFile(manifestUri, Buffer.from(JSON.stringify(courseManifest, null, 2), 'utf-8'));
  }

  static async getCourseTitle(courseId: string): Promise<string> {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(vscode.Uri.file(Paths.getCourseDir(courseId)), 'course.json'));
      return JSON.parse(Buffer.from(content).toString('utf-8')).title || courseId;
    } catch { return courseId; }
  }

  static async getLessonTitle(courseId: string, lessonId: string): Promise<string> {
    const lessonUri = vscode.Uri.file(Paths.getLessonDir(courseId, lessonId));
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(lessonUri, 'lesson.json'));
      const meta = JSON.parse(Buffer.from(content).toString('utf-8'));
      if (meta.title) return meta.title;
    } catch { /* fall through to the recording metadata */ }
    try {
      const { ScrimReader } = require('../utils/ScrimReader');
      const data = await ScrimReader.read(path.join(lessonUri.fsPath, 'lesson.scrim'));
      return data.meta.title || lessonId;
    } catch { return lessonId; }
  }

  static async createStarterWorkspace(courseId: string, lessonId: string): Promise<vscode.Uri> {
    const starterDir = vscode.Uri.file(Paths.getStarterDir(courseId, lessonId));
    await vscode.workspace.fs.createDirectory(starterDir);
    return starterDir;
  }

  /** Writes an editable workspace snapshot from the recorded project state. */
  static async createFork(
    lessonId: string,
    forkId: string,
    virtualFiles: Record<string, string>,
    timestampMs: number,
    options: WorkspaceSnapshotOptions = {}
  ): Promise<vscode.Uri> {
    const forkDir = vscode.Uri.file(Paths.getForkDir(lessonId, forkId));
    await vscode.workspace.fs.createDirectory(forkDir);

    for (const [filename, contentStr] of Object.entries(virtualFiles)) {
      const normalized = filename.replace(/\\/g, '/').replace(/^\/+/, '');
      const fileUri = vscode.Uri.joinPath(forkDir, normalized);
      const relative = path.relative(forkDir.fsPath, fileUri.fsPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Invalid path: ${filename}`);
      await fs.mkdir(path.dirname(fileUri.fsPath), { recursive: true });
      await fs.writeFile(fileUri.fsPath, Buffer.from(contentStr, 'utf-8'));
    }

    const metadata = {
      kind: 'workspace-snapshot',
      lesson_id: lessonId,
      timestamp_ms: timestampMs,
      created_at: new Date().toISOString(),
      label: `Workspace snapshot at ${this.formatTime(timestampMs)}`,
      environment: 'flake.nix',
      environment_locked: true,
      challenge_id: options.challenge?.id ?? null,
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(forkDir, '.scrim-workspace.json'),
      Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8')
    );
    // Keep the old filename readable for existing sidebar entries.
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(forkDir, '.fork-meta.json'),
      Buffer.from(JSON.stringify({ ...metadata, label: `Snapshot at ${this.formatTime(timestampMs)}` }, null, 2), 'utf-8')
    );

    if (options.challenge) await this.writeChallengeFiles(forkDir, options.challenge);
    return forkDir;
  }

  private static async writeChallengeFiles(
    forkDir: vscode.Uri,
    challenge: NonNullable<WorkspaceSnapshotOptions['challenge']>
  ): Promise<void> {
    const instructions = [
      '# Challenge', '', challenge.prompt, '',
      challenge.hint ? `## Hint\n\n${challenge.hint}` : '',
      challenge.testCmd ? '## Check your work\n\nUse **Scrim: Check Challenge** or run the command below in the workspace terminal.' : '',
      challenge.testCmd ? `\n\`${challenge.testCmd}\`` : '',
      '', 'The environment files are course-managed. Edit the project files, but leave `flake.nix` and lockfiles unchanged unless the teacher says otherwise.'
    ].filter(Boolean).join('\n');
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(forkDir, 'CHALLENGE.md'), Buffer.from(instructions, 'utf-8'));
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(forkDir, '.scrim-challenge.json'),
      Buffer.from(JSON.stringify({ id: challenge.id, prompt: challenge.prompt, test_cmd: challenge.testCmd ?? '', allow_skip: challenge.allowSkip ?? false }, null, 2), 'utf-8')
    );
  }

  private static formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }

  static async initializeGit(uri: vscode.Uri): Promise<void> {
    await run('git', ['init', '-q'], { cwd: uri.fsPath });
  }

  static async openFork(uri: vscode.Uri, context?: vscode.ExtensionContext): Promise<void> {
    const action = await vscode.window.showQuickPick(
      ['Open workspace', 'Open workspace and initialize Git', 'Cancel'],
      { placeHolder: 'Choose how to open this workspace snapshot' }
    );
    if (!action || action === 'Cancel') return;
    if (action.includes('initialize Git')) {
      try {
        await this.initializeGit(uri);
        vscode.window.showInformationMessage('Git repository initialized with the workspace snapshot.');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Could not initialize Git: ${error?.message ?? error}`);
        return;
      }
    }
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
    // The new VS Code window starts its terminal in the workspace root when the user opens one.
    vscode.window.showInformationMessage("Workspace snapshot opened. Open a terminal to work in this folder. Use nix --extra-experimental-features 'nix-command flakes' develop to enter its course environment.");
  }
}
