import * as vscode from 'vscode';
import { ApiClient } from '../api/ApiClient';

export class CatalogViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private searchQuery: string = '';
  
  constructor(private apiClient: ApiClient) {}

  setSearchQuery(query: string) {
    this.searchQuery = query;
    this.refresh();
  }

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
      let courses = (await this.apiClient.getCourses()) || [];
      
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        courses = courses.filter(c => 
          c.title.toLowerCase().includes(q) || 
          (c.description && c.description.toLowerCase().includes(q)) ||
          (c.tags && c.tags.some((t: string) => t.toLowerCase().includes(q))) ||
          (c.level && c.level.toLowerCase().includes(q))
        );
      }

      if (courses.length === 0) {
        return [new vscode.TreeItem(this.searchQuery ? 'No courses matched search.' : 'No courses published yet.', vscode.TreeItemCollapsibleState.None)];
      }

      return courses.map(c => {
        const item = new vscode.TreeItem(c.title, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = `${c.level ? `[${c.level}] ` : ''}${c.description || ''}`;
        item.tooltip = `Tags: ${(c.tags || []).join(', ')}`;
        item.iconPath = new vscode.ThemeIcon('cloud');
        item.contextValue = 'course';
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
