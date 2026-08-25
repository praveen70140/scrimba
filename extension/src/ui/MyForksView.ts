import * as vscode from 'vscode';

export class MyForksViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    
    const placeholder = new vscode.TreeItem('No forks yet.', vscode.TreeItemCollapsibleState.None);
    return Promise.resolve([placeholder]);
  }
}
