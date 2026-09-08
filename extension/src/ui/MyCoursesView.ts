import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { Paths } from '../utils/Paths';
import * as path from 'path';

import { WorkspaceManager } from '../workspace/WorkspaceManager';

export class CourseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly courseId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    description?: string
  ) {
    super(label, collapsibleState);
    this.contextValue = 'course';
    this.iconPath = new vscode.ThemeIcon('repo');
    this.description = description;
    this.tooltip = `Course ID: ${courseId}`;
  }
}

export class LessonTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly courseId: string,
    public readonly lessonId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    description?: string,
    iconId?: string
  ) {
    super(label, collapsibleState);
    this.contextValue = 'lesson';
    this.iconPath = new vscode.ThemeIcon(iconId || 'play-circle');
    this.description = description;
    this.tooltip = `Lesson ID: ${lessonId}`;
  }
}

export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly filePath: string,
    public readonly isDir: boolean,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.contextValue = 'file';
    this.iconPath = isDir ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File;
    if (!isDir) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(filePath)]
      };
    }
  }
}

export class MyCoursesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element && element instanceof CourseTreeItem) {
      // List lessons for this course
      const items: vscode.TreeItem[] = [];
      try {
        const courseDir = path.join(Paths.getBaseDir(), 'courses', element.courseId);
        const dirs = await fs.readdir(courseDir, { withFileTypes: true });
        for (const d of dirs) {
          if (d.isDirectory()) {
            const title = await WorkspaceManager.getLessonTitle(element.courseId, d.name);
            let icon = 'circle-outline';
            let desc = 'Not recorded';
            try {
              const scrimPath = path.join(courseDir, d.name, 'lesson.scrim');
              await fs.access(scrimPath);
              icon = 'check';
              desc = 'Recorded'; // Could parse ScrimReader here, but kept simple to avoid lag
            } catch {}
            items.push(new LessonTreeItem(title, element.courseId, d.name, vscode.TreeItemCollapsibleState.Collapsed, desc, icon));
          }
        }
      } catch (e: any) {
        console.warn('Failed to load lessons for course:', e);
      }
      return items;
    }

    if (element && element instanceof LessonTreeItem) {
      const starterDir = Paths.getStarterDir(element.courseId, element.lessonId);
      return this.getFilesForDir(starterDir);
    }

    if (element && element instanceof FileTreeItem) {
      if (element.isDir) {
        return this.getFilesForDir(element.filePath);
      }
      return [];
    }
    
    // Root level: list courses
    const items: vscode.TreeItem[] = [];

    try {
      const coursesDir = path.join(Paths.getBaseDir(), 'courses');
      const dirs = await fs.readdir(coursesDir, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory()) {
          const title = await WorkspaceManager.getCourseTitle(d.name);
          // Count lessons
          let lessonCount = 0;
          try {
            const courseDir = path.join(coursesDir, d.name);
            const lessonDirs = await fs.readdir(courseDir, { withFileTypes: true });
            lessonCount = lessonDirs.filter(l => l.isDirectory()).length;
          } catch {}
          items.push(new CourseTreeItem(title, d.name, vscode.TreeItemCollapsibleState.Collapsed, `${lessonCount} lesson${lessonCount === 1 ? '' : 's'}`));
        }
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        const errorItem = new vscode.TreeItem('Error loading courses', vscode.TreeItemCollapsibleState.None);
        errorItem.description = e.message;
        items.push(errorItem);
      }
    }

    return items;
  }

  private async getFilesForDir(dirPath: string): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      // Sort directories first, then files
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of entries) {
        // Skip hidden files/folders (except maybe .gitignore?)
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(dirPath, entry.name);
        const state = entry.isDirectory() ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        items.push(new FileTreeItem(entry.name, fullPath, entry.isDirectory(), state));
      }
    } catch (e: any) {
      console.warn(`Failed to read directory ${dirPath}:`, e);
    }
    return items;
  }
}
