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
    try {
      // If it has a lesson.scrim, read its metadata
      const lessonUri = vscode.Uri.file(Paths.getLessonDir(courseId, lessonId));
      const scrimUri = vscode.Uri.joinPath(lessonUri, 'lesson.scrim');
      const { ScrimReader } = require('../core/ScrimReader');
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
   * Opens a folder dynamically in the current window for the teacher, without reloading (if possible)
   */
  static async openForTeacher(uri: vscode.Uri, title: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders || [];
    
    // Check if it's already open
    if (folders.some(f => f.uri.fsPath === uri.fsPath)) {
      return;
    }

    // Find any existing lesson folder in the workspace to replace, 
    // keeping the user's original folders intact to prevent window reloads.
    const targetPath = require('path').join('.scrimba', 'courses');
    const existingIndex = folders.findIndex(f => f.uri.fsPath.includes(targetPath));
    
    if (existingIndex >= 0) {
      vscode.workspace.updateWorkspaceFolders(existingIndex, 1, { uri, name: title });
    } else {
      vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri, name: title });
    }
  }

  /**
   * Opens a fork in a new window so the current player session is not destroyed
   */
  static async openFork(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
  }
}
