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
      return [];
    }
    
    try {
      const courses = (await this.apiClient.getCourses()) || [];
      if (courses.length === 0) {
        return [new vscode.TreeItem('No courses published yet.', vscode.TreeItemCollapsibleState.None)];
      }

      return courses.map(c => {
        const item = new vscode.TreeItem(c.title, vscode.TreeItemCollapsibleState.None);
        item.description = c.description || undefined;
        item.iconPath = new vscode.ThemeIcon('cloud');
        return item;
      });
    } catch (e: any) {
      console.error('[CatalogView] Failed to fetch courses:', e.message, e);
      const errItem = new vscode.TreeItem('Failed to connect to backend.', vscode.TreeItemCollapsibleState.None);
      errItem.description = "Is `bun run --hot src/index.ts` running?";
      return [errItem];
    }
  }
}
