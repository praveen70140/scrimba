import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { Paths } from '../utils/Paths';
import * as path from 'path';

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
    if (element) {
      // If clicking a course, list its lessons (placeholder)
      return [];
    }
    
    const items: vscode.TreeItem[] = [];

    const newCourseItem = new vscode.TreeItem('Create New Course', vscode.TreeItemCollapsibleState.None);
    newCourseItem.command = { command: 'scrim.newCourse', title: 'New Course' };
    newCourseItem.iconPath = new vscode.ThemeIcon('add');
    items.push(newCourseItem);

    try {
      const coursesDir = path.join(Paths.getBaseDir(), 'courses');
      const dirs = await fs.readdir(coursesDir, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory()) {
          const courseItem = new vscode.TreeItem(d.name, vscode.TreeItemCollapsibleState.None);
          courseItem.iconPath = new vscode.ThemeIcon('book');
          items.push(courseItem);
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
}
