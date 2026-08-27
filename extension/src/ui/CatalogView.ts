import * as vscode from 'vscode';
import { ApiClient } from '../api/ApiClient';

export class CatalogViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  constructor(private apiClient: ApiClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) {
      if ((element as any).courseId) {
        try {
          const course = await this.apiClient.getCourse((element as any).courseId);
          return (course.lessons || []).map((l: any) => {
            const item = new vscode.TreeItem(l.title, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('play-circle');
            item.command = {
              command: 'scrim.playLesson',
              title: 'Play Lesson',
              arguments: [course.id, l.id]
            };
            return item;
          });
        } catch (e: any) {
          return [new vscode.TreeItem('Failed to load lessons')];
        }
      }
      return [];
    }
    
    try {
      const courses = (await this.apiClient.getCourses()) || [];
      if (courses.length === 0) {
        return [new vscode.TreeItem('No courses published yet.', vscode.TreeItemCollapsibleState.None)];
      }

      return courses.map(c => {
        const item = new vscode.TreeItem(c.title, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = c.description || undefined;
        item.iconPath = new vscode.ThemeIcon('cloud');
        (item as any).courseId = c.id;
        return item;
      });
    } catch (e: any) {
      console.error('[CatalogView] Failed to fetch courses:', e.message, e);
      const errItem = new vscode.TreeItem('Failed to connect to backend.', vscode.TreeItemCollapsibleState.None);
      errItem.description = "Is backend running?";
      return [errItem];
    }
  }
}
