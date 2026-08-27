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
      const enrollments = (await this.apiClient.request<any[]>('GET', '/enroll')) || [];
      if (enrollments.length === 0) {
        return [new vscode.TreeItem('No enrollments yet.', vscode.TreeItemCollapsibleState.None)];
      }

      return enrollments.map(e => {
        const item = new vscode.TreeItem(e.course.title, vscode.TreeItemCollapsibleState.Collapsed);
        item.iconPath = new vscode.ThemeIcon('mortar-board');
        (item as any).courseId = e.course.id;
        return item;
      });
    } catch (e: any) {
      return [new vscode.TreeItem('Failed to connect to backend.', vscode.TreeItemCollapsibleState.None)];
    }
  }
}
