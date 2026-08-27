import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
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

  static async getCourseTitle(courseId: string): Promise<string> {
    try {
      const courseUri = vscode.Uri.file(Paths.getCourseDir(courseId));
      const manifestUri = vscode.Uri.joinPath(courseUri, 'course.json');
      const content = await vscode.workspace.fs.readFile(manifestUri);
      const manifest = JSON.parse(Buffer.from(content).toString('utf-8'));
      return manifest.title || courseId;
    } catch {
      return courseId;
    }
  }

  static async getLessonTitle(courseId: string, lessonId: string): Promise<string> {
    const lessonUri = vscode.Uri.file(Paths.getLessonDir(courseId, lessonId));
    try {
      const metaUri = vscode.Uri.joinPath(lessonUri, 'lesson.json');
      const content = await vscode.workspace.fs.readFile(metaUri);
      const meta = JSON.parse(Buffer.from(content).toString('utf-8'));
      if (meta.title) return meta.title;
    } catch {}

    try {
      // If it has a lesson.scrim, read its metadata
      const scrimUri = vscode.Uri.joinPath(lessonUri, 'lesson.scrim');
      const { ScrimReader } = require('../utils/ScrimReader');
      const data = await ScrimReader.read(scrimUri.fsPath);
      return data.meta.title || lessonId;
    } catch {
      return lessonId;
    }
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
   * Opens a fork. Replaces the current window as requested by the user.
   */
  static async openFork(uri: vscode.Uri, context?: vscode.ExtensionContext): Promise<void> {
    const action = await vscode.window.showQuickPick(
      ['Open in New Window', 'Replace Current Window'],
      { placeHolder: 'How would you like to open this fork?' }
    );
    if (!action) return;
    const forceNewWindow = action === 'Open in New Window';
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow });
  }
}
