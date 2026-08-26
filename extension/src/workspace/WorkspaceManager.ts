import * as vscode from 'vscode';
import { Paths } from '../utils/Paths';

export class WorkspaceManager {
  /**
   * Initializes a new empty course directory
   */
  static async initCourse(courseId: string, courseManifest: any): Promise<void> {
    const courseDir = vscode.Uri.file(Paths.getCourseDir(courseId));
    await vscode.workspace.fs.createDirectory(courseDir);
    
    const manifestUri = vscode.Uri.joinPath(courseDir, 'course.json');
    const content = Buffer.from(JSON.stringify(courseManifest, null, 2), 'utf-8');
    await vscode.workspace.fs.writeFile(manifestUri, content);
  }

  /**
   * Creates an empty starter directory for a new lesson
   */
  static async createStarterWorkspace(courseId: string, lessonId: string): Promise<vscode.Uri> {
    const starterDir = vscode.Uri.file(Paths.getStarterDir(courseId, lessonId));
    await vscode.workspace.fs.createDirectory(starterDir);
    return starterDir;
  }

  /**
   * Copies the current virtual scrim workspace to a real fork directory
   */
  static async createFork(lessonId: string, forkId: string, virtualFiles: Record<string, string>, timestampMs: number): Promise<vscode.Uri> {
    const forkDir = vscode.Uri.file(Paths.getForkDir(lessonId, forkId));
    await vscode.workspace.fs.createDirectory(forkDir);

    // Write all virtual files to disk
    for (const [filename, contentStr] of Object.entries(virtualFiles)) {
      const fileUri = vscode.Uri.joinPath(forkDir, filename);
      // Validate path traversal (Security)
      if (!fileUri.fsPath.startsWith(forkDir.fsPath)) {
        throw new Error(`Invalid path: ${filename} attempts to traverse outside fork directory`);
      }
      
      // Ensure parent directory exists
      const parentUri = vscode.Uri.joinPath(fileUri, '..');
      await vscode.workspace.fs.createDirectory(parentUri);

      const content = Buffer.from(contentStr, 'utf-8');
      await vscode.workspace.fs.writeFile(fileUri, content);
    }

    // Write fork metadata
    const metaUri = vscode.Uri.joinPath(forkDir, '.fork-meta.json');
    const metaContent = Buffer.from(JSON.stringify({
      timestamp_ms: timestampMs,
      created_at: new Date().toISOString(),
      label: `Fork at ${this.formatTime(timestampMs)}`
    }, null, 2), 'utf-8');
    await vscode.workspace.fs.writeFile(metaUri, metaContent);

    return forkDir;
  }

  private static formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Opens a physical folder in VS Code
   */
  static async openEditable(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
  }
}
