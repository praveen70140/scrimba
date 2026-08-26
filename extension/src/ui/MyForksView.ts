import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Paths } from '../utils/Paths';

export class MyForksViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
      return [];
    }

    const items: vscode.TreeItem[] = [];

    try {
      const workspacesDir = path.join(Paths.getBaseDir(), 'workspaces');
      const lessonDirs = await fs.readdir(workspacesDir, { withFileTypes: true });

      for (const lessonDir of lessonDirs) {
        if (!lessonDir.isDirectory()) { continue; }
        const forksDir = path.join(workspacesDir, lessonDir.name, 'forks');

        let forkDirs: string[] = [];
        try {
          const entries = await fs.readdir(forksDir, { withFileTypes: true });
          forkDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
        } catch {
          continue; // no forks folder yet for this lesson
        }

        for (const forkName of forkDirs) {
          const forkPath = path.join(forksDir, forkName);

          // Try to read label from .fork-meta.json
          let label = forkName;
          try {
            const meta = JSON.parse(await fs.readFile(path.join(forkPath, '.fork-meta.json'), 'utf-8'));
            label = meta.label || forkName;
          } catch { /* fall back to folder name */ }

          const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
          item.description = lessonDir.name;
          item.iconPath = new vscode.ThemeIcon('git-branch');
          item.command = {
            command: 'vscode.openFolder',
            title: 'Open Fork',
            arguments: [vscode.Uri.file(forkPath), { forceNewWindow: false }]
          };
          items.push(item);
        }
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        const errItem = new vscode.TreeItem('Error loading forks', vscode.TreeItemCollapsibleState.None);
        errItem.description = e.message;
        items.push(errItem);
      }
    }

    if (items.length === 0) {
      items.push(new vscode.TreeItem('No forks yet.', vscode.TreeItemCollapsibleState.None));
    }

    return items;
  }
}
