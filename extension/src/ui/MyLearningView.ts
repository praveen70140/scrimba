import * as vscode from 'vscode';
import { ApiClient } from '../api/ApiClient';

export class MyLearningViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
      if ((element as any).lessons) {
        return (element as any).lessons.map((l: any) => {
          const item = new vscode.TreeItem(l.title, vscode.TreeItemCollapsibleState.None);
          item.iconPath = new vscode.ThemeIcon(l.completed ? 'pass-filled' : 'play-circle');
          item.description = l.completed ? 'Completed' : '';
          item.command = {
            command: 'scrim.playLesson',
            title: 'Play Lesson',
            arguments: [(element as any).courseId, l.id]
          };
          return item;
        });
      }
      return [];
    }
    
    try {
      const enrollments = (await this.apiClient.request<any[]>('GET', '/enroll')) || [];
      if (enrollments.length === 0) {
        return [new vscode.TreeItem('No enrollments yet.', vscode.TreeItemCollapsibleState.None)];
      }

      return enrollments.map(e => {
        const percent = e.totalCount === 0 ? 0 : Math.round((e.completedCount / e.totalCount) * 100);
        const item = new vscode.TreeItem(e.course.title, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = `${e.completedCount}/${e.totalCount} lessons (${percent}%)`;
        item.iconPath = new vscode.ThemeIcon('mortar-board');
        (item as any).courseId = e.course.id;
        (item as any).lessons = e.course.lessons;
        return item;
      });
    } catch (e: any) {
      return [new vscode.TreeItem('Failed to connect to backend.', vscode.TreeItemCollapsibleState.None)];
    }
  }
}
